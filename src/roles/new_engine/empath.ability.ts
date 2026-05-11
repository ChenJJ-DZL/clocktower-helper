/**
 * 共情者（Empath）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 共情者条目）
 * ============================================================
 *
 * 【角色能力】
 *   "每个夜晚，你会得知与你邻近的两名存活的玩家中邪恶玩家的数量。"
 *
 * 【角色简介】
 *   "共情者会持续得知与自己邻近的玩家是否为邪恶。
 *   共情者只会得知与自己邻近的邪恶玩家数量，但不会得知具体哪一名玩家是邪恶的。
 *   共情者不会探查已死亡的玩家。因此，如果共情者与一位已死亡玩家相邻，他不会
 *   获取到有关死亡玩家的任何信息。取而代之的是，他会获取与那位死亡玩家同一
 *   方向上最近的存活玩家的信息。
 *   共情者在恶魔之后行动，因此如果恶魔杀死了共情者邻近玩家之一，共情者不会
 *   得知有关那位现在已死的玩家的信息。共情者的信息以当晚黎明时的状态为基准，
 *   而非黄昏。"
 *
 * 【运作方式】
 *   "每个夜晚，唤醒共情者。为共情者用手势比划与他邻近的邪恶玩家数量
 *   （0，1，或2）。让共情者重新入睡。"
 *
 * 【规则细节】
 *   "共情者得知的信息是当晚黎明时的状况，而非黄昏时的，因此在当晚复活的角色
 *   （通常会是在共情者行动之前复活），也可能会因为成为与共情者邻近的存活玩家，
 *   从而影响共情者获取的信息。"
 *
 * 【提示与技巧（相关片段）】
 *   "当心间谍！他们可能被你当作好人，导致你得到错误的数字。另外，陌客也可能
 *   被你当作邪恶，这将导致你会误以为自己坐在邪恶阵营玩家旁边。"
 *   → Spy 可注册为善良，Recluse 可注册为邪恶，影响计数。
 *
 * ============================================================
 * 夜晚顺序（引自 json/rule/夜晚行动顺序一览（首夜）.json）
 *   序号 52：洗衣妇    → wakePriority = 10
 *   序号 53：图书管理员 → wakePriority = 11
 *   序号 54：调查员    → wakePriority = 12
 *   序号 55：厨师      → wakePriority = 13
 *   序号 56：共情者    → wakePriority = 14（56 - 42）
 *   公式：wakePriority = 官方序号 - 42
 *   注意：共情者每个夜晚都行动（EVERY_NIGHT 而非 FIRST_NIGHT）。
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
  alignment?: string;
  role?: {
    id: string;
    name: string;
    type: string;
    alignment?: string;
  };
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
 * 对应规则：共情者死亡时技能不应触发；醉酒/中毒时允许触发，
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

  const effects =
    seat.statusEffects ?? snapshot.statusEffects?.[seat.id] ?? [];
  const isDrunk = effects.some((e: any) => e.type === "drunk");
  const isPoisoned = effects.some((e: any) => e.type === "poisoned");

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      abilityEffective: !(isDrunk || isPoisoned),
    },
  };
};

// ─── 辅助函数 ─────────────────────────────────────────────────────────

/**
 * 判断给定玩家在共情者探查中是否应被视为"邪恶阵营"。
 *
 * 判定优先级（从高到低）：
 *  1. seat.isGoodConverted === true       → 已被转化为善良，不算邪恶
 *  2. seat.isEvilConverted === true       → 已被转化为邪恶，算邪恶
 *  3. role.type === "demon" / "minion"    → 按角色类型判定
 *  4. seat.isDemonSuccessor === true      → 红唇女郎继任恶魔
 *  5. seat.alignment === "evil"           → 兼容预计算快照
 *  6. seat.role?.alignment === "evil"     → 兼容 role 上带 alignment
 *  7. 其余情况                           → 非邪恶
 */
function isEvilForEmpath(seat: PlayerLookup): boolean {
  if (!seat.role && !seat.roleId) return false;

  if (seat.isGoodConverted) return false;
  if (seat.isEvilConverted) return true;

  const roleType = seat.role?.type ?? "";
  if (roleType === "demon" || roleType === "minion") return true;

  if (seat.isDemonSuccessor) return true;
  if (seat.alignment === "evil") return true;
  if (seat.role?.alignment === "evil") return true;

  return false;
}

/**
 * 确定 Recluse 在本次共情者探查中是否被当作邪恶。
 *
 * 规则："陌客也有可能被你当作邪恶阵营"
 * → Recluse 有 50% 概率注册为邪恶。
 *
 * 一致性保证：使用 meta 缓存首次判定结果。
 */
function resolveRecluseForEmpath(
  seatId: number,
  meta: Record<string, any>
): boolean {
  const key = `empath_recluse_${seatId}`;
  if (meta[key] !== undefined) return meta[key] as boolean;

  const result = Math.random() < 0.5;
  meta[key] = result;
  return result;
}

/**
 * 确定 Spy 在本次共情者探查中是否被当作善良（从而不记为邪恶）。
 *
 * 规则："间谍可能不会被当作是邪恶阵营"
 * → Spy 有 50% 概率注册为善良。
 * 返回 true 表示「被当作善良，不记为邪恶」。
 */
function resolveSpyForEmpath(
  seatId: number,
  meta: Record<string, any>
): boolean {
  const key = `empath_spy_${seatId}`;
  if (meta[key] !== undefined) return meta[key] as boolean;

  const result = Math.random() < 0.5;
  meta[key] = result;
  return result;
}

/**
 * 判断给定玩家在共情者计数中是否「有效」视为邪恶（考虑 Recluse / Spy 干扰）。
 *
 * Recluse：原本非邪恶 → 50% 概率变为邪恶
 * Spy：    原本邪恶   → 50% 概率变为非邪恶
 */
function isEffectivelyEvil(
  seat: PlayerLookup,
  meta: Record<string, any>
): boolean {
  const roleId = seat.role?.id ?? seat.roleId ?? "";
  const baseIsEvil = isEvilForEmpath(seat);

  if (roleId === "recluse") {
    return resolveRecluseForEmpath(seat.id, meta);
  }

  if (roleId === "spy") {
    const registersAsGood = resolveSpyForEmpath(seat.id, meta);
    return registersAsGood ? false : baseIsEvil;
  }

  return baseIsEvil;
}

/**
 * 获取共情者左侧和右侧最近的存活玩家。
 *
 * 规则：共情者不会探查已死亡的玩家。如果相邻玩家死亡，则沿同一方向
 * 继续查找最近的存活玩家。座位排列为圆形。
 *
 * @param seats    全量座位列表
 * @param selfIdx  共情者在 seats 中的索引
 * @returns [leftSeat, rightSeat] 左右两侧最近的存活玩家
 */
function getNearestAliveNeighbors(
  seats: PlayerLookup[],
  selfIdx: number
): [PlayerLookup | null, PlayerLookup | null] {
  const count = seats.length;
  if (count <= 1) return [null, null];

  let left: PlayerLookup | null = null;
  let right: PlayerLookup | null = null;

  // 向左搜索最近的存活玩家
  for (let i = 1; i < count; i++) {
    const idx = (selfIdx - i + count) % count;
    if (seats[idx].isAlive && !seats[idx].isDead) {
      left = seats[idx];
      break;
    }
  }

  // 向右搜索最近的存活玩家
  for (let i = 1; i < count; i++) {
    const idx = (selfIdx + i) % count;
    if (seats[idx].isAlive && !seats[idx].isDead) {
      right = seats[idx];
      break;
    }
  }

  return [left, right];
}

/**
 * 核心计算：统计共情者左右两侧存活邻座中的邪恶数量
 *
 * @param seats 全量座位列表
 * @param selfIdx 共情者在 seats 中的索引
 * @param meta 用于缓存 Recluse/Spy 注册状态的上下文
 * @returns 邪恶邻座数量（0, 1, 或 2）
 */
function countEvilNeighbors(
  seats: PlayerLookup[],
  selfIdx: number,
  meta: Record<string, any>
): number {
  const [left, right] = getNearestAliveNeighbors(seats, selfIdx);

  let count = 0;
  if (left && isEffectivelyEvil(left, meta)) count++;
  if (right && isEffectivelyEvil(right, meta)) count++;

  return count;
}

/**
 * 生成醉酒/中毒时的虚假数字。
 *
 * 规则：给出一个看似合理的数字（0-2），可能与真实值不同。
 */
function generateFakeEvilCount(
  seats: PlayerLookup[],
  selfIdx: number
): number {
  const candidates: number[] = [];
  for (let v = 0; v <= 2; v++) {
    candidates.push(v);
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：生成共情者能力结果（邪恶邻座数量）。
 *
 * 优先级（从高到低）：
 * 1. storytellerInput.overrideResult   — 说书人手动完全覆盖（无条件采用）
 * 2. storytellerInput.fakeResult       — 说书人预设假信息（仅 !abilityEffective 时）
 * 3. meta.empathResult                 — 预置能力结果
 * 4. countEvilNeighbors                — 动态计算（最终兜底）
 *
 * abilityEffective 由 abilityPriorityCalculation 中间件在 calculate
 * 阶段前自动注入。
 */
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, storytellerInput, actionNode } = context;
  const abilityEffective = meta.abilityEffective ?? true;

  const seats: PlayerLookup[] = snapshot.seats ?? [];
  if (seats.length === 0) {
    return { ...context, aborted: true, abortReason: "无座位数据" };
  }

  const selfSeat = seats.find((s: any) => s.id === actionNode.seatId);
  if (!selfSeat) {
    return { ...context, aborted: true, abortReason: "未找到共情者座位" };
  }
  const selfIdx = seats.indexOf(selfSeat);

  let evilNeighborCount: number;

  // 优先级 1：说书人手动完全覆盖
  if (storytellerInput?.overrideResult !== undefined) {
    evilNeighborCount = storytellerInput.overrideResult as number;
  }
  // 优先级 2：说书人预设假信息（仅当能力被干扰时使用）
  else if (!abilityEffective && storytellerInput?.fakeResult !== undefined) {
    evilNeighborCount = storytellerInput.fakeResult as number;
  }
  // 优先级 3：预置能力结果
  else if (meta.empathResult !== undefined) {
    const realCount = meta.empathResult as number;
    evilNeighborCount = abilityEffective
      ? realCount
      : generateFakeEvilCount(seats, selfIdx);
  }
  // 优先级 4：动态计算
  else {
    evilNeighborCount = abilityEffective
      ? countEvilNeighbors(seats, selfIdx, meta)
      : generateFakeEvilCount(seats, selfIdx);
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: evilNeighborCount,
      isCorrupted: !abilityEffective,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：将共情者结果持久化到 actionNode 和 snapshot 中。
 *
 * 存储位置：
 * - actionNode.meta.empathResult
 * - snapshot._abilityResults.empath
 */
const stateUpdateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult as number | undefined;

  if (result === undefined) return context;

  const record = {
    evilNeighborCount: result,
    isCorrupted: meta.isCorrupted ?? false,
    timestamp: Date.now(),
  };

  return {
    ...context,
    actionNode: {
      ...context.actionNode,
      meta: {
        ...context.actionNode.meta,
        empathResult: record,
      },
    },
    snapshot: {
      ...context.snapshot,
      _abilityResults: {
        ...((context.snapshot as any)._abilityResults ?? {}),
        empath: result,
      },
    },
  };
};

// ─── 后置处理中间件 ───────────────────────────────────────────────────

/**
 * postProcess 阶段：生成日志、说书人提示词、UI 展示数据。
 *
 * 输出内容：
 * 1. console.log   — 英文 simulation log（含干扰标记）
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

  const tag = meta.isCorrupted ? "【受干扰】" : "";

  const simLog = `[Empath]${tag} Evil neighbors: ${result}`;

  const storytellerPrompt =
    `共情者，请睁眼。与你邻近的邪恶玩家有 ${result} 名。`;

  const abilityLog =
    `共情者${tag}获得信息：你的邻座中有 ${result} 名邪恶玩家`;

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "empath_info",
        evilNeighborCount: result,
        isCorrupted: meta.isCorrupted ?? false,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const empathAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "empath",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "empath_night_ability",
  /** 能力中文名 */
  abilityName: "邪恶邻座感知",

  /** 触发时机：每个夜晚 */
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  /**
   * 唤醒优先级（越小越先唤醒）
   * 对应官方首夜顺序 #56 → wakePriority = 56 - 42 = 14
   *   洗衣妇 10 (52) < 图书管理员 11 (53) < 调查员 12 (54)
   *   < 厨师 13 (55) < 共情者 14 (56)
   */
  wakePriority: 14,
  /** 共情者每个夜晚都苏醒（非仅首夜） */
  firstNightOnly: false,
  /** 唤醒提示词 ID，对应 promptDictionary.ts 中的角色唤醒词条 */
  wakePromptId: "role.empath.wake",

  /**
   * 目标选择配置
   * 共情者是纯被动信息类角色（无需手动选择目标），
   * 由引擎自动计算邻近邪恶玩家数量并告知玩家。
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

  /** preCheck：前置条件检查（存活 + 状态标记），无首夜限制 */
  preCheck: [preCheckAliveAndStatus],

  /** calculate：核心效果计算（统计邪恶邻座数量） */
  calculate: [calculateResult],

  /** stateUpdate：状态持久化（记录到 actionNode / snapshot） */
  stateUpdate: [stateUpdateResult],

  /** postProcess：后处理（日志 + 提示词 + UI 数据） */
  postProcess: [postProcessResult],
});
