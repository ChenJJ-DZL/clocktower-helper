/**
 * 调查员（Investigator）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 调查员条目）
 * ============================================================
 *
 * 【角色能力】
 *   "在你的首个夜晚，你会得知两名玩家和一个爪牙角色：这两名玩家之一是该角色
 *   （或者你会得知没有爪牙在场）。"
 *
 * 【角色简介】
 *   "调查员会得知一个特定的在场爪牙角色，但不知道是谁在扮演该角色。
 *   在第一个夜晚，调查员会得知两名玩家其中一人的爪牙角色。
 *   调查员只会得知一次信息，之后便无法获取更多信息。"
 *
 * 【运作方式】
 *   "在为首个夜晚进行准备时，将调查员的'爪牙'提示标记放置在任意一个爪牙
 *   角色标记旁，然后将调查员的'错误'提示标记放置在任意其他角色标记旁。
 *   在首个夜晚里，唤醒调查员，并指向标记有'爪牙'和'错误'的玩家。
 *   将标记有'爪牙'的玩家的角色标记展示给调查员。让调查员重新入睡。"
 *
 * 【提示标记】
 *   "放置条件：放置在一个对应爪牙角色或能被当作爪牙角色的角色标记旁边。"
 *   → 间谍（spy）和陌客（recluse）可被当作爪牙。
 *
 * 【规则细节】
 *   "在仅有一名爪牙且为间谍的情况下，调查员可能会将间谍当作非爪牙角色，
 *   从而得知没有爪牙在场。
 *   ... 如果在首夜就中毒或醉酒，调查员可能会得知错误的玩家（没有放置他的
 *   提示标记的玩家），或得知错误的角色，或两者兼而有之。但即使如此，说书人
 *   也应该让调查员得知爪牙角色，否则等同于在明示调查员他自己醉酒中毒。
 *   ... 特定角色互动：陌客：调查员能将陌客当作爪牙，并得知陌客和任意其他
 *   玩家之中有一个任意爪牙角色。"
 *
 * 【提示与技巧（相关片段）】
 *   "在第一天尽早公布你的信息。你可能无法确定到底哪位玩家是爪牙，但如果你
 *   成功让大家相信你的话，那么善良阵营是有足够的时间将两名玩家全都处决的。"
 *   → 作为信息类角色，调查员获知的信息可用于锁定爪牙身份。
 *
 * ============================================================
 * 夜晚顺序（引自 json/rule/夜晚行动顺序一览（首夜）.json）
 *   序号 52：洗衣妇    → wakePriority = 10（52 - 42）
 *   序号 53：图书管理员 → wakePriority = 11（53 - 42）
 *   序号 54：调查员    → wakePriority = 12（54 - 42）
 *   序号 55：厨师      → wakePriority = 13（55 - 42）
 *   公式：wakePriority = 官方序号 - 42
 * ============================================================
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 辅助类型 ────────────────────────────────────────────────────────

interface InvestigatorInfo {
  seat1: number;
  seat2: number;
  roleName: string;
}

/** 兼容 snapshot.seats 中各种可能的数据结构 */
interface PlayerLookup {
  id: number;
  isDead: boolean;
  isAlive: boolean;
  playerName?: string;
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
 * 对应规则：只有存活且未被干扰的调查员才能获取正确信息。
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
 * preCheck 第 2 步：首夜限制
 *
 * 对应规则：调查员仅在首个夜晚获得信息（仅一次，之后不再唤醒）。
 */
const firstNightOnlyCheck = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot } = context;
  const nightCount = snapshot.nightCount ?? 0;
  const gamePhase = snapshot.gamePhase ?? "";

  if (nightCount !== 1 && gamePhase !== "firstNight") {
    return { ...context, aborted: true, abortReason: "非首夜，调查员不唤醒" };
  }

  return context;
};

// ─── 辅助函数 ─────────────────────────────────────────────────────────

/**
 * 获取可注册为爪牙的座位列表（排除自身和死亡玩家）
 *
 * 对应规则：
 * - 正常爪牙（role.type === "minion"）是主要候选
 * - 间谍（"spy"）可被当作爪牙（提示标记说明"能被当作爪牙角色"）
 * - 陌客（"recluse"）可被当作爪牙（规则细节明确说明）
 */
function getMinionCandidates(
  seats: PlayerLookup[],
  selfSeatId: number
): Array<{ seat: PlayerLookup; roleName: string }> {
  const candidates: Array<{ seat: PlayerLookup; roleName: string }> = [];

  for (const seat of seats) {
    if (seat.id === selfSeatId || seat.isDead || !seat.role) continue;

    const realRole = seat.role;
    const displayRole = seat.effectiveRole ?? seat.charadeRole ?? realRole;

    if (realRole.type === "minion") {
      candidates.push({ seat, roleName: displayRole.name ?? realRole.name });
    }
  }

  return candidates;
}

/**
 * 获取场上所有爪牙角色的名称列表（用于醉酒/中毒时生成合理的假角色）
 */
function getScriptMinionRoles(seats: PlayerLookup[]): string[] {
  const roleNames = new Set<string>();
  for (const seat of seats) {
    if (seat.role?.type === "minion") {
      roleNames.add(seat.role.name);
    }
  }
  return Array.from(roleNames);
}

/**
 * Fisher-Yates 洗牌算法
 */
function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 正常情况生成真实信息
 *
 * 模拟说书人的"爪牙"标记和"错误"标记放置行为：
 * 1. 从爪牙候选池中随机选一名玩家作为"真实爪牙"
 * 2. 从剩余玩家中随机选一名作为"干扰项"
 * 3. 随机打乱顺序
 *
 * 无爪牙候选时返回角色名 ""（表示没有爪牙在场）。
 */
function generateRealInfo(
  seats: PlayerLookup[],
  selfSeatId: number
): InvestigatorInfo {
  const minionCandidates = getMinionCandidates(seats, selfSeatId);

  if (minionCandidates.length === 0) {
    return { seat1: -1, seat2: -1, roleName: "" };
  }

  const targetIdx = Math.floor(Math.random() * minionCandidates.length);
  const { seat: targetSeat, roleName: targetRoleName } =
    minionCandidates[targetIdx];

  const decoyPool = seats.filter(
    (s: any) =>
      s.id !== targetSeat.id && s.id !== selfSeatId && !s.isDead && s.role
  );
  const decoySeat =
    decoyPool.length > 0
      ? decoyPool[Math.floor(Math.random() * decoyPool.length)]
      : targetSeat;

  const ids =
    Math.random() < 0.5
      ? [targetSeat.id, decoySeat.id]
      : [decoySeat.id, targetSeat.id];

  return { seat1: ids[0], seat2: ids[1], roleName: targetRoleName };
}

/**
 * 醉酒/中毒时生成虚假信息
 *
 * 对应规则："说书人也应该让调查员得知爪牙角色，否则等同于在明示调查员
 * 他自己醉酒中毒了"。
 * 实现策略：随机选两名玩家 + 随机选一个爪牙角色名（可能在场也可能不在场）。
 */
function generateFakeInfo(
  seats: PlayerLookup[],
  selfSeatId: number
): InvestigatorInfo {
  const minionRoles = getScriptMinionRoles(seats);
  const others = seats.filter(
    (s: any) => s.id !== selfSeatId && !s.isDead && s.role
  );

  if (others.length === 0) {
    return { seat1: -1, seat2: -1, roleName: "" };
  }

  const shuffled = shuffleArray(others);
  const seat1 = shuffled[0]?.id ?? selfSeatId;
  const seat2 = shuffled[1]?.id ?? seat1;

  const roleName =
    minionRoles.length > 0
      ? minionRoles[Math.floor(Math.random() * minionRoles.length)]
      : "";

  return { seat1, seat2, roleName };
}

// ─── 核心解析器 ──────────────────────────────────────────────────────

/**
 * 解析调查员最终获得的信息，按以下优先级：
 *
 * 1. storytellerInput.overrideResult    — 说书人手动完全覆盖
 * 2. storytellerInput.fakeResult        — 说书人指定的假信息（醉酒/中毒时）
 * 3. meta.initialNightInfo.investigatorInfo — 预置首夜信息
 * 4. 动态生成（generateRealInfo / generateFakeInfo）
 *
 * 注意：abilityEffective 由 abilityPriorityCalculation 中间件在
 * calculate 阶段前自动计算（处理 Vortox、咖啡师、酿酒师、醉酒/中毒等覆盖）。
 */
function resolveInvestigatorInfo(
  snapshot: any,
  selfSeatId: number,
  abilityEffective: boolean,
  storytellerInput?: any,
  initialNightInfo?: any
): InvestigatorInfo {
  // 优先级 1：说书人手动覆盖（无条件采用）
  if (storytellerInput?.overrideResult) {
    return storytellerInput.overrideResult as InvestigatorInfo;
  }

  // 优先级 2：说书人预设的虚假信息
  if (!abilityEffective && storytellerInput?.fakeResult) {
    return storytellerInput.fakeResult as InvestigatorInfo;
  }

  // 优先级 3：预置首夜信息
  if (initialNightInfo?.investigatorInfo) {
    const info = initialNightInfo.investigatorInfo as InvestigatorInfo;
    if (!abilityEffective) {
      const allMinions = getScriptMinionRoles(snapshot.seats);
      const others = allMinions.filter((r) => r !== info.roleName);
      return {
        seat1: info.seat1,
        seat2: info.seat2,
        roleName:
          others.length > 0
            ? others[Math.floor(Math.random() * others.length)]
            : info.roleName,
      };
    }
    return info;
  }

  // 优先级 4：动态生成
  return abilityEffective
    ? generateRealInfo(snapshot.seats, selfSeatId)
    : generateFakeInfo(snapshot.seats, selfSeatId);
}

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：生成调查员能力结果
 *
 * 使用 abilityEffective（由 abilityPriorityCalculation 中间件计算）：
 * - true  → 返回真实信息
 * - false → 返回虚假信息（替换玩家/角色，但保持爪牙角色类型）
 */
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, storytellerInput } = context;
  const abilityEffective = meta.abilityEffective ?? true;
  const selfSeatId = context.actionNode.seatId;

  const selfSeat = snapshot.seats.find((s: any) => s.id === selfSeatId);
  if (!selfSeat) {
    return { ...context, aborted: true, abortReason: "未找到调查员座位" };
  }

  const info = resolveInvestigatorInfo(
    snapshot,
    selfSeatId,
    abilityEffective,
    storytellerInput,
    meta.initialNightInfo
  );

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: info,
      isCorrupted: !abilityEffective,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：将调查员信息持久化到 actionNode 和 snapshot 中。
 *
 * 对应规则：
 * - "将标记有'爪牙'的玩家的角色标记展示给调查员"
 * - "如果说书人由于场上无爪牙而未放置这两个标记，则对调查员展示手势'0'"
 *
 * 存储位置：
 * - actionNode.meta.investigatorResult    — 当前行动节点元数据
 * - snapshot._abilityResults.investigator — 全局能力结果记录
 */
const stateUpdateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult as InvestigatorInfo | undefined;

  if (!result) return context;

  const record = {
    seat1: result.seat1,
    seat2: result.seat2,
    roleName: result.roleName ?? "",
    hasMinion: !!result.roleName,
    isCorrupted: meta.isCorrupted ?? false,
    timestamp: Date.now(),
  };

  return {
    ...context,
    actionNode: {
      ...context.actionNode,
      meta: {
        ...context.actionNode.meta,
        investigatorResult: record,
      },
    },
    snapshot: {
      ...context.snapshot,
      _abilityResults: {
        ...((context.snapshot as any)._abilityResults ?? {}),
        investigator: result,
      },
    },
    meta: {
      ...context.meta,
      investigatorResult: record,
    },
  };
};

// ─── 后置处理中间件 ───────────────────────────────────────────────────

/**
 * postProcess 阶段：生成日志、说书人提示词、UI 展示数据
 *
 * 输出内容：
 * 1. console.log — 详细 simulation log（含玩家名 + 座位号 + 干扰标记）
 * 2. meta.prompt — 说书人看到的唤醒提示词
 * 3. meta.abilityLog — 中文游戏日志
 * 4. meta.displayInfo — UI 消费的结构化数据
 */
const postProcessResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult as InvestigatorInfo | undefined;

  if (!result) return context;

  const selfSeatId = context.actionNode.seatId;
  const tag = meta.isCorrupted ? "【受干扰】" : "";

  // 无爪牙在场（手势 0）
  if (!result.roleName) {
    const simLog = `[Investigator]${tag} No minions in play (0)`;
    const storytellerPrompt = `唤醒${selfSeatId + 1}号【调查员】，告诉他场上没有爪牙在场（手势 0）。`;
    const abilityLog = `调查员${tag}得知：场上没有爪牙在场`;

    console.log(simLog);

    return {
      ...context,
      meta: {
        ...context.meta,
        prompt: storytellerPrompt,
        abilityLog,
        displayInfo: {
          type: "investigator_info",
          hasMinion: false,
          players: [],
          roleName: "",
          isCorrupted: meta.isCorrupted ?? false,
          log: abilityLog,
        },
      },
    };
  }

  const findLabel = (seatId: number): string => {
    const seat: PlayerLookup | undefined = context.snapshot.seats.find(
      (s: any) => s.id === seatId
    );
    return seat?.playerName
      ? `${seat.playerName}(${seatId + 1}号)`
      : `${seatId + 1}号`;
  };

  const label1 = findLabel(result.seat1);
  const label2 = findLabel(result.seat2);

  const simLog = `[Investigator]${tag} ${label1} & ${label2} → ${result.roleName}`;

  const storytellerPrompt = `唤醒${selfSeatId + 1}号【调查员】，告诉他${result.seat1 + 1}号和${result.seat2 + 1}号其中一位是【${result.roleName}】。`;

  const abilityLog = `调查员${tag}获得信息：${label1}和${label2}之中有一名是【${result.roleName}】`;

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "investigator_info",
        hasMinion: true,
        players: [result.seat1, result.seat2],
        roleName: result.roleName,
        isCorrupted: meta.isCorrupted ?? false,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const investigatorAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "investigator",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "investigator_first_night_ability",
  /** 能力中文名 */
  abilityName: "爪牙识别",

  /** 触发时机：仅首夜 */
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  /**
   * 唤醒优先级（越小越先唤醒）
   * 对应官方首夜顺序 #54（54 - 42 = 12）
   * 在同类信息角色中：
   *   洗衣妇 10 (52) < 图书管理员 11 (53) < 调查员 12 (54) < 厨师 13 (55)
   */
  firstNightPriority: 54,
  otherNightPriority: null,
  /** 仅首夜生效，非首夜不唤醒 */
  firstNightOnly: true,
  /** 唤醒提示词 ID，对应 promptDictionary.ts */
  wakePromptId: "role.investigator.wake",

  /**
   * 目标选择配置
   * 调查员是信息类角色（无需主动选择目标），由说书人/引擎自动分配信息
   * min: 0, max: 0 表示无需玩家选择目标
   * allowSelf: false — 调查员不能选择自己
   * allowDead: false — 只能探查存活玩家
   */
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },

  // ── 中间件管道 ──────────────────────────────────────────────────────
  // Pipeline 执行顺序：preCheck → calculate → stateUpdate → postProcess

  /** preCheck：前置条件检查（存活 + 首夜 + 状态标记） */
  preCheck: [preCheckAliveAndStatus, firstNightOnlyCheck],

  /** calculate：核心效果计算（信息生成） */
  calculate: [calculateResult],

  /** stateUpdate：状态持久化（记录到 actionNode / snapshot） */
  stateUpdate: [stateUpdateResult],

  /** postProcess：后处理（日志 + 提示词 + UI 数据） */
  postProcess: [postProcessResult],
});
