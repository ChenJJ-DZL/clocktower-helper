/**
 * 酒鬼（Drunk）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 酒鬼条目）
 * ============================================================
 *
 * 【角色能力】
 *   "你不知道你是酒鬼。你以为你是一个镇民角色，但其实你不是。"
 *
 *   → 认知覆盖：酒鬼玩家从始至终认为自己是一个特定的镇民角色。
 *     实际角色是外来者（无能力），所有"能力生效"都会失败。
 *
 * 【角色简介】
 *   "酒鬼以为自己是镇民，且对自己实际上是酒鬼一事毫不知情。
 *    在初始设置时，不会将酒鬼的角色标记放进盲抽袋中。作为替代，
 *    会有一个镇民的角色标记放进盲抽袋中，且抽到该角色标记的
 *    玩家会在整场游戏中秘密地成为酒鬼。说书人知道哪位镇民实际
 *    上是酒鬼，而酒鬼玩家无从得知。
 *    酒鬼没有任何能力。不论他获得的镇民标记是否会以某些方式影响
 *    游戏，酒鬼却无法使用这一镇民能力。然而，说书人会装作酒鬼
 *    玩家是他以为的那种镇民。如果那个镇民会在夜晚醒来，酒鬼同样
 *    会被唤醒并如同那个镇民的方式进行行动。如果那个镇民能够获取
 *    信息，说书人可以对酒鬼给出错误的信息作为替代。"
 *
 *   → 核心机制：
 *     - 酒鬼以为自己是某镇民（fakeRole），实际角色是 drunk
 *     - 游戏引擎以 fakeRole 的"能力"唤醒酒鬼执行 pipeline
 *     - 但能力不会实际生效（permanent drunk status）
 *     - 信息类能力 → abilityEffective = false → 错误信息
 *
 * 【运作方式】
 *   "在游戏设置时，将角色标记放进盲抽袋之前，移除酒鬼标记并添加
 *    一枚额外的镇民角色标记。将酒鬼的'是酒鬼'提示标记放置进魔典中。
 *    将用于替换的镇民角色标记放进盲抽袋中，而不是酒鬼的角色标记。
 *    在为首个夜晚进行准备时，将酒鬼的'是酒鬼'提示标记放置在用于
 *    替换的那名镇民角色标记旁，用于提醒那名玩家的角色实际上是酒鬼。
 *    在游戏过程中，以酒鬼的镇民角色来让酒鬼进行行动。"
 *
 *   → 本实现：
 *     - setupConfig 记录 fakeRole（酒鬼以为的镇民角色）
 *     - seat.fakeRole 让引擎以该角色进行行动调度
 *     - 永久 type === "drunk"（source: "drunk"）使 abilityEffective = false
 *
 * 【提示标记】
 *   "放置时机：在为首个夜晚做准备时放置。
 *    放置条件：在将所有玩家的角色标记收回到魔典后，在其中一个
 *    镇民角色标记旁放置。"
 *   → 说书人可通过 storytellerInput.fakeRole 指定酒鬼以为的角色。
 *
 * 【规则细节】
 *   "如果酒鬼醉酒或中毒，他不会有任何变化。属于认知覆盖类的能力
 *    不会因为醉酒或中毒失效。"
 *   → 酒鬼的 permanent drunk 是角色固有效果，不受外部 drunk/poisoned 影响。
 *
 *   "特定角色互动：咖啡师的'清醒且健康'效果能够让能获取信息的
 *    酒鬼在生效期间内获得正确信息。"
 *   → 咖啡师效果由 abilityPriorityCalculation 处理：prioritySource === "barista"
 *     时 abilityEffective = true，酒鬼在当夜获得正确信息。
 *
 * 【提示与技巧（相关片段）】
 *   "酒鬼永远不知道自己是酒鬼——他在游戏开始时就会获得一个镇民
 *    角色标记，在收到错误信息时也会表现得像个普通镇民一样。"
 *   → 游戏全程以 fakeRole 身份调度，酒鬼无法从引擎行为中察觉差异。
 *
 * ============================================================
 * 夜晚顺序
 *   酒鬼为认知覆盖（PASSIVE + 设置阶段激活）。
 *   首夜：说书人准备时通过 storytellerInput 配置 fakeRole。
 *   后续夜：酒鬼以其 fakeRole 的身份被唤醒并由对应 pipeline 处理。
 *   wakePriority: 0（被动能力，不使用唤醒队列）
 * ============================================================
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 辅助类型 ────────────────────────────────────────────────────────

/** 兼容 snapshot.seats 中各种可能的数据结构 */
interface PlayerLookup {
  id: number;
  isDead: boolean;
  isAlive?: boolean;
  playerName?: string;
  role?: { id: string; name: string; type: string };
  roleId?: string;
  roleType?: string;
  roleName?: string;
  /** 酒鬼以为的镇民角色 */
  fakeRole?: { id: string; name: string; type: string };
  statusEffects?: Array<{
    type: string;
    source?: string;
    permanent?: boolean;
    [key: string]: any;
  }>;
  [key: string]: any;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck 第 1 步：存活检测。
 *
 * 对应规则：酒鬼的认知覆盖是角色本身效果，与存活无关。
 * 但已死亡的酒鬼不再需要参与唤醒调度（死亡玩家不行动）。
 */
const preCheckAliveOnly = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat: PlayerLookup | undefined = snapshot.seats.find(
    (s: any) => s.id === actionNode.seatId
  );

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "酒鬼已死亡" };
  }

  // 酒鬼的 cognitive override 不受外部 drunk/poisoned 影响
  // （规则："如果酒鬼醉酒或中毒，他不会有任何变化"）
  // 但 permanent drunk 效果由 abilityPriorityCalculation 处理
  return {
    ...context,
    meta: {
      ...context.meta,
      isAbilityActive: true, // cognitive override 本身恒生效
    },
  };
};

/**
 * preCheck 第 2 步：首夜限制（仅首夜执行设置）。
 *
 * 酒鬼的 fakeRole 首次设置发生在首夜准备阶段。
 * 后续夜酒鬼以其 fakeRole 身份行动（不由本文件调度）。
 */
const firstNightOnlyCheck = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot } = context;
  const nightCount = snapshot.nightCount ?? 0;
  const gamePhase = snapshot.gamePhase ?? "";

  // 非首夜时跳过（fakeRole 已在首夜设置完毕）
  if (nightCount !== 1 && gamePhase !== "firstNight") {
    return {
      ...context,
      aborted: true,
      abortReason: "酒鬼的 fakeRole 已在首夜设置，无需再次执行",
    };
  }

  return context;
};

// ─── 辅助函数 ─────────────────────────────────────────────────────────

/**
 * 从剧本中获取一个镇民角色作为酒鬼的虚假身份。
 *
 * 优先级：
 * 1. storytellerInput.fakeRole — 说书人手动指定
 * 2. 从 seats 中随机选一个不在场的镇民角色
 * 3. 从 seats 中随机选一个在场的镇民角色（兜底）
 */
function selectFakeRole(
  seats: PlayerLookup[],
  drunkSeatId: number,
  storytellerInput?: any
): { id: string; name: string; type: string } {
  // 优先级 1：说书人指定
  if (storytellerInput?.fakeRole) {
    return storytellerInput.fakeRole as { id: string; name: string; type: string };
  }

  // 收集在场镇民角色（排除酒鬼自己）
  const presentTownsfolk = seats.filter(
    (s: PlayerLookup) =>
      s.id !== drunkSeatId &&
      s.role?.type === "townsfolk"
  );

  if (presentTownsfolk.length === 0) {
    // 兜底：极端情况（无镇民在场）
    return { id: "washerwoman", name: "洗衣妇", type: "townsfolk" };
  }

  // 随机选一个在场镇民的角色名作为 fakeRole
  // （规则：酒鬼以为自己是场上的某个镇民角色）
  const randomSeat = presentTownsfolk[Math.floor(Math.random() * presentTownsfolk.length)];
  return {
    id: randomSeat.role!.id,
    name: randomSeat.role!.name,
    type: "townsfolk",
  };
}

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：确定酒鬼的虚假镇民角色（fakeRole）。
 *
 * 优先级：
 * 1. storytellerInput.fakeRole — 说书人手动指定
 * 2. 随机选择在场镇民角色
 */
const calculateFakeRole = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, storytellerInput, actionNode } = context;

  const seats: PlayerLookup[] = snapshot.seats ?? [];
  if (seats.length === 0) {
    return { ...context, aborted: true, abortReason: "无座位数据" };
  }

  const fakeRole = selectFakeRole(seats, actionNode.seatId, storytellerInput);

  return {
    ...context,
    meta: {
      ...context.meta,
      fakeRole,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：设置酒鬼的虚假身份和永久醉酒状态。
 *
 * 对应规则：
 * - "在为首个夜晚进行准备时，将酒鬼的'是酒鬼'提示标记放置在
 *   用于替换的那名镇民角色标记旁"
 * - "酒鬼没有任何能力" → 永久 type: "drunk"（source: "drunk"）
 *
 * 存储方式：
 * - seat.fakeRole — 酒鬼以为的镇民角色（引擎以此调度）
 * - seat.statusEffects 中 permanent drunk — 使 abilityEffective = false
 *
 * 注意：此处设置的永久 drunk 是角色固有属性，区别于中毒者的临时中毒。
 * abilityPriorityCalculation 会检测 type: "drunk" 并设 abilityEffective = false。
 */
const applyDrunkSetup = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const fakeRole = meta.fakeRole as { id: string; name: string; type: string } | undefined;

  if (!fakeRole) {
    return context;
  }

  const newSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat: any) => {
      if (seat.id === actionNode.seatId) {
        return {
          ...seat,
          // 酒鬼以为的镇民角色
          fakeRole,
          // 永久醉酒（角色固有属性，非外部状态）
          statusEffects: [
            ...(seat.statusEffects ?? []).filter(
              (e: any) => !(e.type === "drunk" && e.source === "drunk")
            ),
            {
              type: "drunk",
              source: "drunk",
              permanent: true,
              appliedAt: Date.now(),
            },
          ],
        };
      }
      return seat;
    }),
  };

  return {
    ...context,
    snapshot: newSnapshot,
    meta: {
      ...context.meta,
      drunkSetupApplied: true,
    },
  };
};

// ─── 后置处理中间件 ───────────────────────────────────────────────────

/**
 * postProcess 阶段：生成日志、说书人提示词、UI 展示数据。
 */
const postProcessResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, actionNode } = context;
  const fakeRole = meta.fakeRole as { id: string; name: string; type: string } | undefined;

  if (!fakeRole) return context;

  const applied = meta.drunkSetupApplied === true;

  // 英文 simulation log
  const simLog = applied
    ? `[Drunk] Seat ${actionNode.seatId} thinks they are ${fakeRole.name} (${fakeRole.id}) — permanent drunk`
    : `[Drunk] Setup skipped for seat ${actionNode.seatId}`;

  // 说书人提示词
  const storytellerPrompt = applied
    ? `酒鬼（${actionNode.seatId + 1}号）已设置：他以为自己是【${fakeRole.name}】。他已永久醉酒。`
    : ``;

  // 中文游戏日志
  const abilityLog = applied
    ? `酒鬼（${actionNode.seatId + 1}号）已配置 fakeRole = ${fakeRole.name}，永久醉酒`
    : `酒鬼未设置`;

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "drunk_setup",
        applied,
        fakeRoleId: fakeRole.id,
        fakeRoleName: fakeRole.name,
        seatId: actionNode.seatId,
        isCorrupted: false, // 酒鬼的认知覆盖不受干扰
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const drunkAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "drunk",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "drunk_first_night_ability",
  /** 能力中文名 */
  abilityName: "烂醉如泥",

  /**
   * 触发时机：
   * - FIRST_NIGHT：首夜说书人配置 fakeRole（设置阶段也用此触发器）
   * - PASSIVE：认知覆盖效果全局永久生效
   */
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT, AbilityTriggerTiming.PASSIVE],
  /**
   * 唤醒优先级（越小越先唤醒）
   * 首夜设置在 info 角色之后（wakePriority 80 很晚），
   * 确保说书人可以先看到哪些镇民在场再做选择。
   */
  wakePriority: 80,
  /** 仅首夜执行 fakeRole 设置 */
  firstNightOnly: true,
  /** 唤醒提示词 ID，对应 promptDictionary.ts */
  wakePromptId: "role.drunk.wake",

  /**
   * 目标选择配置
   * 酒鬼无需选择目标（认知覆盖为被动/设置效果）。
   * 说书人通过 storytellerInput.fakeRole 指定虚假镇民角色。
   */
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },

  // ── 中间件管道 ──────────────────────────────────────────────────────
  // Pipeline 执行顺序：preCheck → calculate → stateUpdate → postProcess

  /** preCheck：前置条件检查（存活 + 首夜） */
  preCheck: [preCheckAliveOnly, firstNightOnlyCheck],

  /** calculate：核心计算（选择 fakeRole） */
  calculate: [calculateFakeRole],

  /** stateUpdate：状态持久化（设置 fakeRole + 永久醉酒） */
  stateUpdate: [applyDrunkSetup],

  /** postProcess：后处理（日志 + 提示词 + UI 数据） */
  postProcess: [postProcessResult],
});
