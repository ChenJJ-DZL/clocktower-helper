/**
 * 送葬者（Undertaker）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 送葬者条目）
 * ============================================================
 *
 * 【角色能力】
 *   "每个夜晚*，你会得知今天白天死于处决的玩家的角色。"
 *
 * 【运作方式】
 *   "如果一名玩家死于处决，将送葬者的'死于今日'提示标记放置在那名死亡玩家的角色标记旁。
 *    除首个夜晚以外的每个夜晚，如果当天有任何玩家死于处决，唤醒送葬者。
 *    向他展示被标记了'死于今日'的角色标记。让送葬者重新入睡。"
 *   → 在每个非首夜检查是否有玩家被处决（executedToday），如果有则读取该玩家的真实角色。
 *
 * 【规则细节】
 *   "如果白天无人被处决，或发生了处决但无人死亡，送葬者可能不会被唤醒，
 *    也可能会被唤醒但不得知任何消息。"
 *   → 当天无玩家死于处决时，技能跳过。
 *
 *   "在夜晚因处决而死亡的玩家其角色不会被送葬者得知。"
 *   → 仅关注白天处决。
 *
 *   "当心间谍和陌客！他们有可能相应地被你当做善良角色和邪恶角色，
 *    因为他们的能力在他们死后也依然生效。"
 *   → Recluse 死后仍可注册为邪恶角色；Spy 死后仍可注册为善良角色。
 *
 * 【提示与技巧（相关片段）】
 *   "被处决的玩家越多，你得到的信息就越多。"
 *   "你不会得知旅行者的角色。他们会因为流放而死亡，但不会因为处决而死亡。"
 *   "如果被处决的玩家是酒鬼，你将会看到酒鬼的角色标记。"
 *
 * ============================================================
 * 夜晚顺序（引自 json/rule/夜晚行动顺序一览（其他夜晚）.json）
 *   序号 93：送葬者 → wakePriority = 51（93 - 42）
 *   在信息类角色中：
 *     守鸦人 38 (80) < 送葬者 51 (93) < 提刑官 52 (94)
 * ============================================================
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 辅助类型 ────────────────────────────────────────────────────────

interface UndertakerInfo {
  executedSeatId: number;
  roleName: string;
}

/** 兼容 snapshot.seats 中各种可能的数据结构 */
interface PlayerLookup {
  id: number;
  isDead: boolean;
  isAlive: boolean;
  playerName?: string;
  executedToday?: boolean;
  role?: { id: string; name: string; type: string };
  effectiveRole?: { id: string; name: string; type: string };
  charadeRole?: { id: string; name: string; type: string };
  statusEffects?: Array<{ type: string }>;
  [key: string]: any;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck 第 1 步：存活检测 + 醉酒/中毒标记
 *
 * 对应规则：只有存活且未被干扰的送葬者才能获取正确信息。
 * 醉酒/中毒时仍允许技能触发，但效果在 calculate 阶段被替换为假信息。
 *
 * 注意：只设置 isAbilityActive，不修改 abilityEffective。
 * abilityEffective 由 abilityPriorityCalculation 中间件在
 * calculate 阶段前自动注入（处理 Vortox、咖啡师、酿酒师、
 * 醉酒/中毒等覆盖）。
 */
const preCheckAliveAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat: PlayerLookup | undefined = snapshot.seats.find(
    (s: any) => s.id === actionNode.seatId
  );

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }

  const effects = seat.statusEffects ?? snapshot.statusEffects?.[seat.id] ?? [];
  const isDrunk = effects.some((e: any) => e.type === "drunk");
  const isPoisoned = effects.some((e: any) => e.type === "poisoned");

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      isAbilityActive: !(isDrunk || isPoisoned),
    },
  };
};

/**
 * preCheck 第 2 步：首夜跳过
 *
 * 对应规则：送葬者的能力标有 *（每个夜晚*），表示首夜不唤醒。
 */
const otherNightOnlyCheck = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot } = context;
  const nightCount = snapshot.nightCount ?? 0;
  const gamePhase = snapshot.gamePhase ?? "";

  if (nightCount === 1 || gamePhase === "firstNight") {
    return { ...context, aborted: true, abortReason: "首夜，送葬者不唤醒" };
  }

  return context;
};

/**
 * preCheck 第 3 步：今日处决检测
 *
 * 对应规则："如果当天有任何玩家死于处决，唤醒送葬者。"
 * 检查 snapshot.seats 中是否有 executedToday === true 的座位。
 */
const executedTodayCheck = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot } = context;
  const executedSeat: PlayerLookup | undefined = snapshot.seats.find(
    (s: any) => s.executedToday
  );

  if (!executedSeat) {
    return {
      ...context,
      aborted: true,
      abortReason: "今日无玩家被处决，送葬者技能不触发",
    };
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      executedSeatId: executedSeat.id,
    },
  };
};

// ─── 辅助函数 ─────────────────────────────────────────────────────────

/**
 * 获取目标玩家的角色名，考虑 Recluse 等注册效果。
 *
 * Recluse（陌客）：50% 概率被当作邪恶角色（minion 或 demon）。
 * 酒鬼：展示酒鬼角色标记而非其以为的角色标记。
 */
function resolveExecutedRole(
  executedSeat: PlayerLookup,
  seats: PlayerLookup[]
): string {
  const realRole = executedSeat.role;
  const displayRole =
    executedSeat.effectiveRole ?? executedSeat.charadeRole ?? realRole;

  if (realRole?.id === "recluse" && Math.random() < 0.5) {
    const evilRoles = seats.filter(
      (s: any) => s.role?.type === "minion" || s.role?.type === "demon"
    );
    if (evilRoles.length > 0) {
      const randomEvil =
        evilRoles[Math.floor(Math.random() * evilRoles.length)];
      return randomEvil.role?.name ?? displayRole?.name ?? "未知角色";
    }
  }

  return displayRole?.name ?? realRole?.name ?? "未知角色";
}

/**
 * 醉酒/中毒时生成虚假角色名，从场上其他玩家中随机取一个角色名。
 */
function generateFakeRoleName(
  executedSeatId: number,
  seats: PlayerLookup[]
): string {
  const others = seats.filter((s: any) => s.id !== executedSeatId && s.role);
  if (others.length === 0) return "洗衣妇";
  const random = others[Math.floor(Math.random() * others.length)];
  return random.role?.name ?? "洗衣妇";
}

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：生成送葬者能力结果
 *
 * 使用 abilityEffective（由 abilityPriorityCalculation 中间件计算）：
 * - true  → 返回被处决玩家的真实角色
 * - false → 返回虚假角色名
 *
 * 优先级：
 * 1. storytellerInput.overrideResult   — 说书人手动完全覆盖
 * 2. storytellerInput.fakeResult        — 说书人预设假信息（仅 !abilityEffective）
 * 3. initialNightInfo.undertakerInfo    — 预置首夜信息
 * 4. 动态生成（resolveExecutedRole / generateFakeRoleName）
 */
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, storytellerInput } = context;
  const abilityEffective = meta.abilityEffective ?? true;
  const executedSeatId = meta.executedSeatId as number | undefined;

  if (executedSeatId === undefined) {
    return { ...context, aborted: true, abortReason: "未找到被处决玩家" };
  }

  const executedSeat: PlayerLookup | undefined = snapshot.seats.find(
    (s: any) => s.id === executedSeatId
  );
  if (!executedSeat) {
    return { ...context, aborted: true, abortReason: "被处决玩家数据不存在" };
  }

  // 优先级 1：说书人手动覆盖
  if (storytellerInput?.overrideResult) {
    return {
      ...context,
      meta: {
        ...context.meta,
        abilityResult: storytellerInput.overrideResult as UndertakerInfo,
        isCorrupted: !abilityEffective,
      },
    };
  }

  // 优先级 2：说书人预设假信息
  if (!abilityEffective && storytellerInput?.fakeResult) {
    return {
      ...context,
      meta: {
        ...context.meta,
        abilityResult: storytellerInput.fakeResult as UndertakerInfo,
        isCorrupted: true,
      },
    };
  }

  // 优先级 3：预置首夜信息
  if (meta.initialNightInfo?.undertakerInfo) {
    const preset = meta.initialNightInfo.undertakerInfo as UndertakerInfo;
    if (!abilityEffective) {
      return {
        ...context,
        meta: {
          ...context.meta,
          abilityResult: {
            executedSeatId: preset.executedSeatId,
            roleName: generateFakeRoleName(
              preset.executedSeatId,
              snapshot.seats
            ),
          } as UndertakerInfo,
          isCorrupted: true,
        },
      };
    }
    return {
      ...context,
      meta: {
        ...context.meta,
        abilityResult: preset,
        isCorrupted: false,
      },
    };
  }

  // 优先级 4：动态计算
  const roleName = abilityEffective
    ? resolveExecutedRole(executedSeat, snapshot.seats)
    : generateFakeRoleName(executedSeatId, snapshot.seats);

  const result: UndertakerInfo = {
    executedSeatId,
    roleName,
  };

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: result,
      isCorrupted: !abilityEffective,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：将送葬者信息持久化到 actionNode 和 snapshot 中。
 *
 * 存储位置：
 * - actionNode.meta.undertakerResult — 当前行动节点元数据
 * - snapshot._abilityResults.undertaker — 全局能力结果记录
 * - meta.undertakerResult — 上下文中间件数据
 */
const stateUpdateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult as UndertakerInfo | undefined;

  if (!result?.roleName) return context;

  const persistedRecord = {
    executedSeatId: result.executedSeatId,
    roleName: result.roleName,
    isCorrupted: meta.isCorrupted ?? false,
    timestamp: Date.now(),
  };

  return {
    ...context,
    actionNode: {
      ...context.actionNode,
      meta: {
        ...context.actionNode.meta,
        undertakerResult: persistedRecord,
      },
    },
    snapshot: {
      ...context.snapshot,
      _abilityResults: {
        ...((context.snapshot as any)._abilityResults ?? {}),
        undertaker: result,
      },
    },
    meta: {
      ...context.meta,
      undertakerResult: persistedRecord,
    },
  };
};

// ─── 后置处理中间件 ───────────────────────────────────────────────────

/**
 * postProcess 阶段：生成日志、说书人提示词、UI 展示数据
 *
 * 输出内容：
 * 1. console.log — 详细 simulation log（含干扰标记）
 * 2. meta.prompt — 说书人看到的唤醒提示词
 * 3. meta.abilityLog — 中文游戏日志
 * 4. meta.displayInfo — UI 消费的结构化数据
 */
const postProcessResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult as UndertakerInfo | undefined;

  if (!result?.roleName) return context;

  const findLabel = (seatId: number): string => {
    const seat: PlayerLookup | undefined = context.snapshot.seats.find(
      (s: any) => s.id === seatId
    );
    return seat?.playerName
      ? `${seat.playerName}(${seatId + 1}号)`
      : `${seatId + 1}号`;
  };

  const label = findLabel(result.executedSeatId);
  const tag = meta.isCorrupted ? "【受干扰】" : "";

  // 详细 simulation log
  const simLog = `[Undertaker]${tag} Today executed: ${label} → ${result.roleName}`;

  const selfSeatId = context.actionNode.seatId;

  // 说书人提示词
  const storytellerPrompt = `唤醒${selfSeatId + 1}号【送葬者】，告诉他上一个白天被处决的玩家是${result.roleName}。`;

  // 中文日志
  const abilityLog = `送葬者${tag}得知：今天被处决的 ${label} 的角色是【${result.roleName}】`;

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "undertaker_info",
        executedSeatId: result.executedSeatId,
        roleName: result.roleName,
        isCorrupted: meta.isCorrupted ?? false,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const undertakerAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "undertaker",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "undertaker_night_ability",
  /** 能力中文名 */
  abilityName: "殓尸人",

  /** 触发时机：每个夜晚（不含首夜，因为首夜之前不会有处决） */
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  /**
   * 唤醒优先级（越小越先唤醒）
   * 对应官方其他夜晚顺序 #93（93 - 42 = 51）
   *   守鸦人 38 (80) < 送葬者 51 (93) < 提刑官 52 (94)
   */
  wakePriority: 51,
  /** 非首夜触发 */
  firstNightOnly: false,
  /** 唤醒提示词 ID */
  wakePromptId: "role.undertaker.wake",

  /**
   * 目标选择配置
   * 送葬者是信息类角色（无需主动选择目标），由引擎自动查找今日被处决玩家
   * min: 0, max: 0 表示无需玩家选择目标
   * allowSelf: false, allowDead: false — 与自身和死者无关
   */
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },

  // ── 中间件管道 ──────────────────────────────────────────────────────
  // Pipeline 执行顺序：preCheck → calculate → stateUpdate → postProcess

  /** preCheck：前置条件检查（存活 + 状态标记 + 首夜跳过 + 今日处决检测） */
  preCheck: [preCheckAliveAndStatus, otherNightOnlyCheck, executedTodayCheck],

  /** calculate：核心效果计算（获取被处决玩家的角色） */
  calculate: [calculateResult],

  /** stateUpdate：状态持久化（记录到 actionNode / snapshot） */
  stateUpdate: [stateUpdateResult],

  /** postProcess：后处理（日志 + 提示词 + UI 数据） */
  postProcess: [postProcessResult],
});
