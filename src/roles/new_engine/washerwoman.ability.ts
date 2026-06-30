/**
 * 洗衣妇（Washerwoman）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 洗衣妇条目）
 * ============================================================
 *
 * 【角色能力】
 *   "在你的首个夜晚，你会得知两名玩家和一个镇民角色：这两名玩家之一是该角色。"
 *
 * 【运作方式】
 *   "在为首个夜晚进行准备时，将洗衣妇的'镇民'提示标记放置在任意一个
 *    镇民角色标记旁，然后将洗衣妇的'错误'提示标记放置在任意其他角色标记旁。
 *    在首个夜晚里，唤醒洗衣妇，并指向标记有'镇民'和'错误'的玩家。
 *    将标记有'镇民'的玩家标记展示给洗衣妇。让洗衣妇重新入睡。"
 *
 * 【提示标记】
 *   "放置条件：放置在一个镇民角色或能被当作镇民角色的角色标记旁边。"
 *   → 间谍（spy）和隐士（recluse）可被当作镇民。
 *
 * 【规则细节】
 *   "不同于图书管理员和调查员，洗衣妇永远不可能得知没有镇民在场。
 *    在极端情况下（如5人局且有男爵在场时），洗衣妇会得知自己与任意
 *    一名玩家之中有洗衣妇。"
 *   → 当场上无镇民时，返回「洗衣妇」自身作为角色名。
 *
 *   "如果在首夜就中毒或醉酒，洗衣妇可能会得知错误的玩家（没有放置
 *    洗衣妇标记的玩家），或得知错误的角色，或两者兼而有之。但即使如此，
 *    说书人也应该让洗衣妇得知镇民角色，否则等同于在明示洗衣妇她自己
 *    醉酒中毒了。"
 *   → 中毒/醉酒时仍返回镇民角色，但玩家或角色可能是错误的。
 *
 *   "间谍：洗衣妇能将间谍当作镇民，并得知间谍和任意其他玩家之中有
 *    一个任意镇民角色。"
 *   → 间谍（spy）可注册为镇民，本实现中将其纳入镇民候选池。
 *   → 隐士（recluse）同理，可被当作镇民。
 *
 * 【提示与技巧（相关片段）】
 *   "洗衣妇……将决定游戏的最终结果。记得在这个节点让你的队伍
 *    仔细思考你的信息。"
 *   → 作为信息类角色，洗衣机获知的信息可用于缩小嫌疑范围。
 *
 * ============================================================
 * 夜晚顺序（引自 json/rule/夜晚行动顺序一览（首夜）.json）
 *   序号 52：洗衣妇 → wakePriority = 10（52 - 42）
 *   序号 53：图书管理员 → wakePriority = 11
 *   序号 54：调查员 → wakePriority = 12
 *   序号 55：厨师 → wakePriority = 13
 * ============================================================
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 辅助类型 ────────────────────────────────────────────────────────

interface WasherwomanInfo {
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
 * 对应规则：只有存活且未被干扰的洗衣妇才能获取正确信息。
 * 醉酒/中毒时仍允许技能触发，但效果在 calculate 阶段被替换为假信息。
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

  // 从 seat.statusEffects 或 snapshot.statusEffects 中读取状态
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
 * 对应规则：洗衣妇仅在首个夜晚获得信息（仅一次，之后不再唤醒）。
 */
const firstNightOnlyCheck = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot } = context;
  const nightCount = snapshot.nightCount ?? 0;
  const gamePhase = snapshot.gamePhase ?? "";

  // 非首夜时跳过（nightCount === 1 或 gamePhase === "firstNight"）
  if (nightCount !== 1 && gamePhase !== "firstNight") {
    return { ...context, aborted: true, abortReason: "非首夜，洗衣妇不唤醒" };
  }

  return context;
};

// ─── 辅助函数 ─────────────────────────────────────────────────────────

/**
 * 获取可注册为镇民的座位列表（排除自身和死亡玩家）
 *
 * 对应规则：
 * - 正常镇民（role.type === "townsfolk"）是主要候选
 * - 间谍（"spy"）可被当作镇民（规则细节明确说明）
 * - 隐士（"recluse"）可被当作镇民（提示标记说明"能被当作镇民角色"）
 * - 酒鬼（"drunk"）使用其 charadeRole 显示的角色名（酒鬼自己以为的角色）
 */
function getTownsfolkCandidates(
  seats: PlayerLookup[],
  selfSeatId: number
): Array<{ seat: PlayerLookup; roleName: string }> {
  const candidates: Array<{ seat: PlayerLookup; roleName: string }> = [];

  for (const seat of seats) {
    if (seat.id === selfSeatId || seat.isDead || !seat.role) continue;

    const realRole = seat.role;
    const displayRole = seat.effectiveRole ?? seat.charadeRole ?? realRole;

    // 间谍和隐士可以注册为镇民
    const canRegisterAsTownsfolk =
      realRole.id === "spy" || realRole.id === "recluse";

    if (realRole.type === "townsfolk" || canRegisterAsTownsfolk) {
      candidates.push({ seat, roleName: displayRole.name ?? realRole.name });
    }
  }

  return candidates;
}

/**
 * 获取场上所有镇民角色的名称列表（用于醉酒/中毒时生成合理的假角色）
 */
function getScriptTownsfolkRoles(seats: PlayerLookup[]): string[] {
  const roleNames = new Set<string>();
  for (const seat of seats) {
    if (seat.role?.type === "townsfolk") {
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
 * 模拟说书人的"镇民"标记和"错误"标记放置行为：
 * 1. 从镇民候选池中随机选一名玩家作为"真实镇民"（对应"镇民"标记）
 * 2. 从剩余玩家中随机选一名作为"干扰项"（对应"错误"标记）
 * 3. 随机打乱顺序，让洗衣妇无法从位置上猜测谁是真镇民
 *
 * 极端情况（无镇民候选，如 5 人局 + 男爵）：
 *   对应规则："洗衣妇会得知自己与任意一名玩家之中有洗衣妇"
 */
function generateRealInfo(
  seats: PlayerLookup[],
  selfSeatId: number
): WasherwomanInfo {
  const townsfolkCandidates = getTownsfolkCandidates(seats, selfSeatId);

  // 极端情况：无镇民候选
  if (townsfolkCandidates.length === 0) {
    const otherAlive = seats.filter(
      (s: any) => s.id !== selfSeatId && !s.isDead && s.role
    );
    const target = otherAlive[Math.floor(Math.random() * otherAlive.length)];
    const ids = shuffleArray([selfSeatId, target?.id ?? selfSeatId]);
    return { seat1: ids[0], seat2: ids[1], roleName: "洗衣妇" };
  }

  // 随机选择真实镇民目标
  const targetIdx = Math.floor(Math.random() * townsfolkCandidates.length);
  const { seat: targetSeat, roleName: targetRoleName } =
    townsfolkCandidates[targetIdx];

  // 选择干扰项（不能与真实目标相同，不能是自身）
  const decoyPool = seats.filter(
    (s: any) =>
      s.id !== targetSeat.id && s.id !== selfSeatId && !s.isDead && s.role
  );
  const decoySeat =
    decoyPool.length > 0
      ? decoyPool[Math.floor(Math.random() * decoyPool.length)]
      : targetSeat;

  // 随机打乱展示顺序
  const ids =
    Math.random() < 0.5
      ? [targetSeat.id, decoySeat.id]
      : [decoySeat.id, targetSeat.id];

  return { seat1: ids[0], seat2: ids[1], roleName: targetRoleName };
}

/**
 * 醉酒/中毒时生成虚假信息
 *
 * 对应规则："说书人也应该让洗衣妇得知镇民角色，否则等同于在明示
 * 洗衣妇她自己醉酒中毒了"。
 * 实现策略：随机选两名玩家 + 随机选一个镇民角色名（可能在场也可能不在场）。
 */
function generateFakeInfo(
  seats: PlayerLookup[],
  selfSeatId: number
): WasherwomanInfo {
  const townsfolkRoles = getScriptTownsfolkRoles(seats);
  const others = seats.filter(
    (s: any) => s.id !== selfSeatId && !s.isDead && s.role
  );

  const shuffled = shuffleArray(others);
  const seat1 = shuffled[0]?.id ?? selfSeatId;
  const seat2 = shuffled[1]?.id ?? seat1;

  const roleName =
    townsfolkRoles.length > 0
      ? townsfolkRoles[Math.floor(Math.random() * townsfolkRoles.length)]
      : "洗衣妇";

  return { seat1, seat2, roleName };
}

// ─── 核心解析器 ──────────────────────────────────────────────────────

/**
 * 解析洗衣妇最终获得的信息，按以下优先级：
 *
 * 1. storytellerInput.overrideResult   — 说书人手动完全覆盖
 * 2. storytellerInput.fakeResult        — 说书人指定的假信息（醉酒/中毒时）
 * 3. meta.initialNightInfo.washerwomanInfo — 预置首夜信息
 * 4. 动态生成（generateRealInfo / generateFakeInfo）
 *
 * 注意：abilityEffective 由 abilityPriorityCalculation 中间件在
 * calculate 阶段前自动计算（处理 Vortox、咖啡师、酿酒师、醉酒/中毒等覆盖）。
 */
function resolveWasherwomanInfo(
  snapshot: any,
  selfSeatId: number,
  abilityEffective: boolean,
  storytellerInput?: any,
  initialNightInfo?: any
): WasherwomanInfo {
  // 优先级 1：说书人手动覆盖（无条件采用）
  if (storytellerInput?.overrideResult) {
    return storytellerInput.overrideResult as WasherwomanInfo;
  }

  // 优先级 2：说书人预设的虚假信息
  if (!abilityEffective && storytellerInput?.fakeResult) {
    return storytellerInput.fakeResult as WasherwomanInfo;
  }

  // 优先级 3：预置首夜信息
  if (initialNightInfo?.washerwomanInfo) {
    const info = initialNightInfo.washerwomanInfo as WasherwomanInfo;
    if (!abilityEffective) {
      // 醉酒/中毒：保留玩家，换一个不同的镇民角色名
      const allTownsfolk = getScriptTownsfolkRoles(snapshot.seats);
      const others = allTownsfolk.filter((r) => r !== info.roleName);
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
 * calculate 阶段：生成洗衣妇能力结果
 *
 * 使用 abilityEffective（由 abilityPriorityCalculation 中间件计算）：
 * - true  → 返回真实信息（动态生成或预置）
 * - false → 返回虚假信息（替换玩家/角色，但保持镇民角色类型）
 */
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, storytellerInput } = context;
  // abilityEffective 由 abilityPriorityCalculation 注入
  const abilityEffective = meta.abilityEffective ?? true;
  const selfSeatId = context.actionNode.seatId;

  const selfSeat = snapshot.seats.find((s: any) => s.id === selfSeatId);
  if (!selfSeat) {
    return { ...context, aborted: true, abortReason: "未找到洗衣妇座位" };
  }

  const info = resolveWasherwomanInfo(
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
 * stateUpdate 阶段：将洗衣妇信息持久化到 actionNode 和 snapshot 中
 *
 * 存储位置：
 * - actionNode.meta.washerwomanResult — 当前行动节点的元数据
 * - snapshot._abilityResults.washerwoman — 全局可查询的能力结果记录
 *
 * 这样后续其他能力或 UI 可以直接读取而无需重新计算。
 */
const stateUpdateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult as WasherwomanInfo | undefined;

  if (!result?.roleName) return context;

  const persistedRecord = {
    seat1: result.seat1,
    seat2: result.seat2,
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
        washerwomanResult: persistedRecord,
      },
    },
    snapshot: {
      ...context.snapshot,
      _abilityResults: {
        ...((context.snapshot as any)._abilityResults ?? {}),
        washerwoman: result,
      },
    },
    meta: {
      ...context.meta,
      washerwomanResult: persistedRecord,
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
 * 3. meta.displayInfo — UI 消费的结构化数据
 */
const postProcessResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult as WasherwomanInfo | undefined;

  if (!result?.roleName) return context;

  // 查找玩家显示名称
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
  const tag = meta.isCorrupted ? "【受干扰】" : "";

  // 详细 simulation log
  const simLog = `[Washerwoman]${tag} ${label1} & ${label2} → ${result.roleName}`;

  // 说书人提示词（使用 +1 显示给玩家看的座位号）
  const selfSeatId = context.actionNode.seatId;
  const storytellerPrompt = `唤醒${selfSeatId + 1}号【洗衣妇】，告诉他${result.seat1 + 1}号和${result.seat2 + 1}号其中一位是【${result.roleName}】。`;

  // 中文日志（供游戏日志系统使用）
  const abilityLog = `洗衣妇${tag}获得信息：${label1}和${label2}之中有一名是【${result.roleName}】`;

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      // 为 NightEngine / UI 提供标准化数据
      displayInfo: {
        type: "washerwoman_info",
        players: [result.seat1, result.seat2],
        roleName: result.roleName,
        isCorrupted: meta.isCorrupted ?? false,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const washerwomanAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "washerwoman",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "washerwoman_first_night_ability",
  /** 能力中文名 */
  abilityName: "身份识别",

  /** 触发时机：仅首夜 */
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  /**
   * 唤醒优先级（越小越先唤醒）
   * 对应官方首夜顺序 #52（52 - 42 = 10）
   * 在同类信息角色中：
   *   洗衣妇 10 < 图书管理员 11 < 调查员 12 < 厨师 13
   */
  firstNightPriority: 52,
  otherNightPriority: null,
  /** 仅首夜生效，非首夜不唤醒 */
  firstNightOnly: true,
  /** 唤醒提示词 ID，对应 promptDictionary.ts */
  wakePromptId: "role.washerwoman.wake",

  /**
   * 目标选择配置
   * 洗衣妇是信息类角色（无需主动选择目标），由说书人/引擎自动分配信息
   * min: 0, max: 0 表示无需玩家选择目标
   * allowSelf: false — 洗衣妇不能选择自己（规则：不探查自身）
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
