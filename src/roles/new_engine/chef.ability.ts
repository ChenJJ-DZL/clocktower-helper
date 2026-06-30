/**
 * 厨师（Chef）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 厨师条目）
 * ============================================================
 *
 * 【角色能力】
 *   "在你的首个夜晚，你会得知场上邻座的邪恶玩家有多少对。"
 *
 * 【角色简介】
 *   "厨师会得知是否有邪恶玩家相邻而坐。
 *    在第一个夜晚，厨师会得知有多少对邪恶玩家相邻而坐。
 *    两名相邻而坐的玩家为一对，然而每名玩家都能分别与两侧的玩家
 *    各组成一对。因此，两名相邻而坐的玩家是一对，三名相邻而坐的
 *    玩家是两对，四名相邻而坐的玩家是三对，以此类推。"
 *
 *   → 核心算法：遍历圆形座位，对每对 (i, (i+1) % N) 判断是否均为邪恶。
 *     三名邪恶相连 → 两对：(邪恶A-邪恶B) 和 (邪恶B-邪恶C)。
 *     四名邪恶相连 → 三对，依此类推。
 *
 *   "厨师会像探查其他角色类型一样探查邪恶旅行者，但仅仅只会关注
 *    那些在厨师行动前加入游戏的旅行者。"
 *   → 旅行者（type === "traveler"）若为邪恶也应计入，但实际由
 *     seat.alignment / role.alignment 等字段判定。
 *
 * 【运作方式】
 *   "在首个夜晚里，唤醒厨师。为厨师用手势比划场上互为邻座的邪恶
 *    玩家有多少对（0，1，2，等等）。让厨师重新入睡。"
 *
 * 【规则细节】
 *   "厨师的单次能力会为玩家进行多次检测判断。因此具有互动干扰类
 *    能力的角色可能会在与其左右相邻的玩家组合中被当作不同的阵营。
 *    但通常来说，我们建议按照在厨师的单次能力探查中始终保持同一
 *    阵营来进行判断，以提升厨师玩家的游戏体验。"
 *   → 本实现：Recluse / Spy 在同一次厨师技能中保持一致的注册结果
 *     （首次判定后缓存至 meta，后续重用）。
 *
 *   "厨师的能力探查的是相邻玩家，且并未加'存活'这一附加条件。"
 *   → 关键规则：已死亡玩家仍然计入相邻对计算。
 *     实现：countEvilPairs 遍历 snapshot.seats（全量列表），
 *     不按 isAlive/isDead 过滤。
 *
 * 【范例】（取自暗流涌动官方规则）
 *   示例：5 人局，座位顺序 [善良A, 邪恶爪牙, 善良B, 邪恶恶魔, 善良C]
 *   相邻邪恶对：(邪恶爪牙-善良B=不是), (善良B-邪恶恶魔=不是),
 *   (邪恶恶魔-善良C=不是), (善良C-善良A=不是), (善良A-邪恶爪牙=不是)
 *   → 结果为 0。
 *   如果调整为 [善良A, 邪恶爪牙, 邪恶恶魔, 善良B, 善良C]
 *   则 (邪恶爪牙-邪恶恶魔)=1 对，(邪恶恶魔-善良B) 不算，余者均不算
 *   → 结果为 1。
 *
 * 【提示与技巧（相关片段）】
 *   "间谍可能不会被当作是邪恶阵营，你可能因此会获得错误的数字。
 *    类似的，陌客也有可能被你当作邪恶阵营。"
 *   → Spy → 50% 概率被当作善良（不计为邪恶）。
 *   → Recluse → 50% 概率被当作邪恶（计为邪恶）。
 *
 * ============================================================
 * 夜晚顺序（引自 json/rule/夜晚行动顺序一览（首夜）.json）
 *   序号 52：洗衣妇 → wakePriority 10
 *   序号 53：图书管理员 → wakePriority 11
 *   序号 54：调查员 → wakePriority 12
 *   序号 55：厨师     → wakePriority 13
 *   公式：wakePriority = 官方序号 - 42
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
  /** 某些快照会在 seat 上预计算 alignment */
  alignment?: string;
  role?: {
    id: string;
    name: string;
    type: string; // "townsfolk" | "outsider" | "minion" | "demon" | "traveler"
    alignment?: string; // 某些数据结构中 role 上也有 alignment
  };
  /** 扁平化字段（兼容某些旧快照） */
  roleId?: string;
  effectiveRole?: { id: string; name: string; type: string };
  charadeRole?: { id: string; name: string; type: string };
  isEvilConverted?: boolean;
  isGoodConverted?: boolean;
  isDemonSuccessor?: boolean;
  statusEffects?: Array<{ type: string }>;
  [key: string]: any;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck 第 1 步：存活检测 + 醉酒/中毒标记
 *
 * 对应规则：厨师死亡时技能不应触发；醉酒/中毒时允许触发，
 * 但效果在 calculate 中被替换为假数字。
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

  // 检查 statusEffects（兼容 seat 自身和 snapshot 顶层两种存储位置）
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
 * 对应规则：厨师仅在首个夜晚获得信息，非首夜不应唤醒。
 */
const firstNightOnlyCheck = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot } = context;
  const nightCount = snapshot.nightCount ?? 0;
  const gamePhase = snapshot.gamePhase ?? "";

  // nightCount === 1 或 gamePhase === "firstNight" 均视为首夜
  if (nightCount !== 1 && gamePhase !== "firstNight") {
    return { ...context, aborted: true, abortReason: "非首夜，厨师不唤醒" };
  }

  return context;
};

// ─── 辅助函数 ─────────────────────────────────────────────────────────

/**
 * 判断给定玩家在厨师探查中是否应被视为"邪恶阵营"。
 *
 * 规则：邪恶阵营包括恶魔、爪牙、被转化为邪恶的玩家、恶魔继任者，
 * 以及某些快照中预先标记为 alignment === "evil" 的玩家（如邪恶旅行者）。
 *
 * 判定优先级（从高到低）：
 *  1. seat.isGoodConverted === true       → 已被转化为善良（如舞蛇人转化恶魔），不算邪恶
 *  2. seat.isEvilConverted === true       → 已被转化为邪恶（如灵言师转化镇民），算邪恶
 *  3. role.type === "demon" / "minion"    → 按角色类型判定
 *  4. seat.isDemonSuccessor === true      → 红唇女郎继任恶魔
 *  5. seat.alignment === "evil"           → 兼容预计算快照（如邪恶旅行者）
 *  6. seat.role?.alignment === "evil"     → 兼容 role 上带 alignment 的数据结构
 *  7. 其余情况                           → 非邪恶（townsfolk/outsider/traveler 默认为善良）
 *
 * 注意：traveler 没有固定的 role.type 对应邪恶，其阵营由说书人决定，
 * 因此依赖 seat.alignment 或 role.alignment 字段。
 */
function isEvilForChef(seat: PlayerLookup): boolean {
  // 没有角色信息时无法判定
  if (!seat.role && !seat.roleId) return false;

  // 优先级 1：被舞蛇人等转化为善良 → 不算邪恶
  if (seat.isGoodConverted) return false;

  // 优先级 2：被灵言师等转化为邪恶 → 算邪恶
  if (seat.isEvilConverted) return true;

  // 优先级 3：根据角色类型判定
  const roleType = seat.role?.type ?? "";
  if (roleType === "demon" || roleType === "minion") return true;

  // 优先级 4：恶魔继任者（红唇女郎变身后）
  if (seat.isDemonSuccessor) return true;

  // 优先级 5：seat 级别预计算的 alignment（邪恶旅行者等情况）
  if (seat.alignment === "evil") return true;

  // 优先级 6：role 级别预计算的 alignment
  if (seat.role?.alignment === "evil") return true;

  // 优先级 7：非邪恶
  return false;
}

/**
 * 确定 Recluse 在本次厨师探查中是否被当作邪恶。
 *
 * 规则细节："陌客也有可能被你当作邪恶阵营"
 * → Recluse（隐士/陌客）有 50% 概率注册为邪恶。
 *
 * 一致性保证：使用 meta 缓存首次判定结果，同一次技能中
 * 该玩家每次出现都返回相同结果。
 *
 * @param seatId  玩家 ID（用于构造缓存键）
 * @param meta    中间件上下文 meta（作为缓存容器）
 */
function resolveRecluseForChef(
  seatId: number,
  meta: Record<string, any>
): boolean {
  const key = `chef_recluse_${seatId}`;
  if (meta[key] !== undefined) return meta[key] as boolean;

  const result = Math.random() < 0.5; // 50% 概率被当作邪恶
  meta[key] = result;
  return result;
}

/**
 * 确定 Spy 在本次厨师探查中是否被当作善良（从而不记为邪恶）。
 *
 * 规则细节："间谍可能不会被当作是邪恶阵营"
 * → Spy（间谍）有 50% 概率注册为善良。
 *
 * 一致性保证：使用 meta 缓存首次判定结果。
 * 返回 true 表示「被当作善良，不记为邪恶」。
 */
function resolveSpyForChef(seatId: number, meta: Record<string, any>): boolean {
  const key = `chef_spy_${seatId}`;
  if (meta[key] !== undefined) return meta[key] as boolean;

  const result = Math.random() < 0.5; // 50% 概率被当作善良
  meta[key] = result;
  return result;
}

/**
 * 判断给定玩家在相邻对中是否「有效」视为邪恶（考虑 Recluse / Spy 干扰）。
 *
 * Recluse：原本非邪恶 → 50% 概率变为邪恶
 * Spy：    原本邪恶     → 50% 概率变为非邪恶
 */
function isEffectivelyEvil(
  seat: PlayerLookup,
  meta: Record<string, any>
): boolean {
  const roleId = seat.role?.id ?? seat.roleId ?? "";
  const baseIsEvil = isEvilForChef(seat);

  // Recluse：可能被当作邪恶（无论原本阵营）
  if (roleId === "recluse") {
    return resolveRecluseForChef(seat.id, meta);
  }

  // Spy：可能被当作善良（不记为邪恶）
  if (roleId === "spy") {
    const registersAsGood = resolveSpyForChef(seat.id, meta);
    return registersAsGood ? false : baseIsEvil;
  }

  return baseIsEvil;
}

/**
 * 核心计算：遍历圆形座位，统计邪恶相邻对的数量。
 *
 * 规则依据：
 * - "两名相邻而坐的玩家为一对，每名玩家都能分别与两侧的玩家各组成一对"
 *   即 (i, i+1) 为一对。
 * - "并未加'存活'这一附加条件"
 *   即已死亡玩家也要参与计算。
 *
 * 圆形座位排列：最后一个座位与第一个座位也构成一对。
 *
 * @param seats 全量座位列表（含死亡玩家）。
 * @param meta  用于缓存 Recluse/Spy 注册状态的上下文。
 * @returns 邪恶相邻对数。
 */
function countEvilPairs(
  seats: PlayerLookup[],
  meta: Record<string, any>
): number {
  const count = seats.length;
  if (count < 2) return 0;

  let pairs = 0;

  for (let i = 0; i < count; i++) {
    const current = seats[i];
    const next = seats[(i + 1) % count];

    const currentEvil = isEffectivelyEvil(current, meta);
    const nextEvil = isEffectivelyEvil(next, meta);

    if (currentEvil && nextEvil) {
      pairs++;
    }
  }

  return pairs;
}

/**
 * 生成醉酒/中毒时的虚假数字。
 *
 * 规则："说书人也应该让厨师得知一个看似合理的数字"
 * 实现逻辑：
 * 1. 如果有真实值（realCount），生成范围 [0, max] 内不等于 realCount 的数字。
 * 2. 如果没有真实值，完全随机。
 *
 * @param seats     全量座位列表。
 * @param realCount 真实邪恶对数（可为 null 表示未知）。
 * @returns 虚假数字。
 */
function generateFakePairCount(
  seats: PlayerLookup[],
  realCount: number | null
): number {
  const max = Math.max(1, seats.length - 1);
  const candidates: number[] = [];

  for (let v = 0; v <= max; v++) {
    if (v !== realCount) candidates.push(v);
  }

  return candidates.length > 0
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : Math.floor(Math.random() * (max + 1));
}

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：生成厨师能力结果（邪恶相邻对数）。
 *
 * 优先级（从高到低）：
 * 1. storytellerInput.overrideResult   — 说书人手动完全覆盖（无条件采用）
 * 2. storytellerInput.fakeResult       — 说书人预设假信息（仅 !abilityEffective 时）
 * 3. meta.initialNightInfo.chefInfo    — 预置首夜信息
 * 4. countEvilPairs                    — 动态计算（最终兜底）
 *
 * abilityEffective 由 abilityPriorityCalculation 中间件在 calculate
 * 阶段前自动注入（处理 Vortox、咖啡师、酿酒师、醉酒/中毒等覆盖）。
 */
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, storytellerInput } = context;
  const abilityEffective = meta.abilityEffective ?? true;

  const seats: PlayerLookup[] = snapshot.seats ?? [];
  if (seats.length === 0) {
    return { ...context, aborted: true, abortReason: "无座位数据" };
  }

  let evilPairCount: number;

  // 优先级 1：说书人手动完全覆盖
  if (storytellerInput?.overrideResult !== undefined) {
    evilPairCount = storytellerInput.overrideResult as number;
  }
  // 优先级 2：说书人预设假信息（仅当能力被干扰时使用）
  else if (!abilityEffective && storytellerInput?.fakeResult !== undefined) {
    evilPairCount = storytellerInput.fakeResult as number;
  }
  // 优先级 3：预置首夜信息
  else if (meta.initialNightInfo?.chefInfo !== undefined) {
    const realCount = meta.initialNightInfo.chefInfo as number;
    evilPairCount = abilityEffective
      ? realCount
      : generateFakePairCount(seats, realCount);
  }
  // 优先级 4：动态计算
  else {
    evilPairCount = abilityEffective
      ? countEvilPairs(seats, meta)
      : generateFakePairCount(seats, null);
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: evilPairCount,
      isCorrupted: !abilityEffective,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：将厨师结果持久化到 actionNode 和 snapshot 中。
 *
 * 存储位置：
 * - actionNode.meta.chefResult            — 当前行动节点元数据
 * - snapshot._abilityResults.chef        — 全局能力结果记录
 */
const stateUpdateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult as number | undefined;

  if (result === undefined) return context;

  const record = {
    evilPairCount: result,
    isCorrupted: meta.isCorrupted ?? false,
    timestamp: Date.now(),
  };

  return {
    ...context,
    actionNode: {
      ...context.actionNode,
      meta: {
        ...context.actionNode.meta,
        chefResult: record,
      },
    },
    snapshot: {
      ...context.snapshot,
      _abilityResults: {
        ...((context.snapshot as any)._abilityResults ?? {}),
        chef: result,
      },
    },
  };
};

// ─── 后置处理中间件 ───────────────────────────────────────────────────

/**
 * postProcess 阶段：生成日志、说书人提示词、UI 展示数据。
 *
 * 输出内容：
 * 1. console.log   — 英文 simulation log（含干扰标记+座位数）
 * 2. meta.prompt   — 说书人看到的唤醒提示词
 * 3. meta.abilityLog — 中文游戏日志
 * 4. meta.displayInfo — UI 消费的结构化数据
 */
const postProcessResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult as number | undefined;

  if (result === undefined) return context;

  const totalSeats = (context.snapshot.seats as PlayerLookup[]).length ?? 0;
  const tag = meta.isCorrupted ? "【受干扰】" : "";

  // 英文 simulation log
  const simLog = `[Chef]${tag} Evil pairs: ${result} (total seats: ${totalSeats})`;

  const selfSeatId = context.actionNode.seatId;

  // 说书人提示词（用手势比划数字）
  const storytellerPrompt = `唤醒${selfSeatId + 1}号【厨师】，告诉他相邻邪恶玩家有 ${result} 对。`;

  // 中文游戏日志
  const abilityLog =
    `厨师${tag}获得信息：场上有 ${result} 对相邻的邪恶玩家` +
    `（共 ${totalSeats} 个座位）`;

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      // 为 NightEngine / UI 提供标准化数据
      displayInfo: {
        type: "chef_info",
        evilPairCount: result,
        totalSeats,
        isCorrupted: meta.isCorrupted ?? false,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const chefAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "chef",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "chef_first_night_ability",
  /** 能力中文名 */
  abilityName: "邪恶邻座感知",

  /** 触发时机：仅首夜 */
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  /**
   * 唤醒优先级（越小越先唤醒）
   * 对应官方首夜顺序 #55 → wakePriority = 55 - 42 = 13
   *   洗衣妇 10 (52) < 图书管理员 11 (53) < 调查员 12 (54) < 厨师 13 (55)
   */
  firstNightPriority: 55,
  otherNightPriority: null,
  /** 仅首夜生效，非首夜不唤醒 */
  firstNightOnly: true,
  /** 唤醒提示词 ID，对应 promptDictionary.ts 中的角色唤醒词条 */
  wakePromptId: "role.chef.wake",

  /**
   * 目标选择配置
   * 厨师是纯信息类角色（无需手动选择目标），
   * 由引擎自动计算相邻邪恶对数并告知玩家。
   * min: 0, max: 0 表示无需玩家选择目标。
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

  /** calculate：核心效果计算（统计邪恶相邻对数） */
  calculate: [calculateResult],

  /** stateUpdate：状态持久化（记录到 actionNode / snapshot） */
  stateUpdate: [stateUpdateResult],

  /** postProcess：后处理（日志 + 提示词 + UI 数据） */
  postProcess: [postProcessResult],
});
