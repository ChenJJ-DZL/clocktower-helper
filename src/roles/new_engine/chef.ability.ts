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
 *     不按是否存活过滤。
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

import type { MiddlewareContext } from "../../utils/middlewareTypes";
import { isSeatEvil } from "../../utils/seatAlignment";
import {
  createDeterministicRandom,
  type DeterministicRandom,
  nightInfoSeed,
} from "../core/deterministicRandom";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 辅助类型 ────────────────────────────────────────────────────────

/** 兼容 snapshot.seats 中各种可能的数据结构 */
interface PlayerLookup {
  id: number;
  isDead: boolean;
  playerName?: string;
  /** 某些快照会在 seat 上预计算 alignment */
  alignment?: string;
  role?: {
    id: string;
    name: string;
    type: string; // "townsfolk" | "outsider" | "minion" | "demon" | "traveler"
    alignment?: string; // 某些数据结构中 role 上也有 alignment
  } | null;
  /** 扁平化字段（兼容某些旧快照） */
  roleId?: string;
  effectiveRole?: { id: string; name: string; type: string } | null;
  charadeRole?: { id: string; name: string; type: string } | null;
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

  if (!seat || seat.isDead) {
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
  // ⭐ 2026-09-14 统一：转发到全项目唯一权威 `isSeatEvil`。
  // 旧实现是一段与权威高度重复的 7 级优先级链，且**漏了 `isGoodConverted`
  // 与 `role.type=traveler` 的处理**，与权威可能给出不同答案。
  // 这里保留「无角色信息时返回 false」的前置守卫以兼容既有语义。
  if (!seat.role && !seat.roleId) return false;
  return isSeatEvil(seat as any);
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
  meta: Record<string, any>,
  ctx?: MiddlewareContext
): boolean {
  const key = `chef_recluse_${seatId}`;
  if (meta[key] !== undefined) return meta[key] as boolean;

  const seat = ctx?.snapshot?.seats?.find((s: any) => s.id === seatId);
  if (seat && (seat as any).registerAsEvil !== undefined) {
    const result = (seat as any).registerAsEvil !== false;
    meta[key] = result;
    return result;
  }

  // 默认：陌客默认为邪恶（除非说书人手动切换或显式指定）
  const forced = (ctx as any)?.storytellerInput?.forceChefRecluseEvil;
  const result = forced !== false;
  meta[key] = result;
  return result;
}

/**
 * 确定 Spy 在本次厨师探查中是否被当作善良（从而不记为邪恶）。
 *
 * 规则细节："间谍可能不会被当作是邪恶阵营"
 * → Spy（间谍）默认注册为善良（不记为邪恶）。
 *
 * 一致性保证：使用 meta 缓存首次判定结果。
 * 返回 true 表示「被当作善良，不记为邪恶」。
 */
function resolveSpyForChef(
  seatId: number,
  meta: Record<string, any>,
  ctx?: MiddlewareContext
): boolean {
  const key = `chef_spy_${seatId}`;
  if (meta[key] !== undefined) return meta[key] as boolean;

  const seat = ctx?.snapshot?.seats?.find((s: any) => s.id === seatId);
  if (seat && (seat as any).registerAsGood !== undefined) {
    const result = (seat as any).registerAsGood !== false;
    meta[key] = result;
    return result;
  }
  if (seat && (seat as any).registerAsEvil !== undefined) {
    const result = !(seat as any).registerAsEvil;
    meta[key] = result;
    return result;
  }

  // 默认：间谍默认为好人（注册为善良，不记为邪恶）
  const forced = (ctx as any)?.storytellerInput?.forceChefSpyGood;
  const result = forced !== false;
  meta[key] = result;
  return result;
}

/**
 * 判断给定玩家在相邻对中是否「有效」视为邪恶（考虑 Recluse / Spy 干扰）。
 *
 * 官方规则细节："厨师的单次能力会为玩家进行多次检测判断。因此具有互动干扰类
 * 能力的角色可能会在与其左右相邻的玩家组合中被当作不同的阵营。"
 *
 * 通用化（2026-09-14）：
 *   · 说书人可在任意座位上设置 `registerAsEvil`（UI：玩家右键 / 信息微调面板 /
 *     控制台），表示"本次探查中把该玩家当作邪恶"。此前只有 recluse 会读该标记，
 *     导致官方范例 3「**邪恶的替罪羊**」只能靠伪造历史字段 `seat.alignment` 才能表达。
 *   · 现在统一：`registerAsEvil` 标记对**任何**角色生效（替罪羊/旅行者/任意"被当作
 *     邪恶"的玩家），与 recluse 走同一条登记通路 —— 读的是生产真正会写入的字段。
 */
function isEffectivelyEvil(
  seat: PlayerLookup,
  meta: Record<string, any>,
  ctx: MiddlewareContext
): boolean {
  const roleId = seat.role?.id ?? seat.roleId ?? "";
  const baseIsEvil = isEvilForChef(seat);

  // ⭐ 通用登记：说书人显式把该座位「当作邪恶」（任何角色都适用）
  //    必须在 role.type 判定之前生效（登记优先于真实阵营）。
  if (roleId !== "recluse" && roleId !== "spy") {
    const registeredAsEvil = (seat as any).registerAsEvil;
    if (registeredAsEvil === true) return true;
    if (registeredAsEvil === false) return false;
  }

  // Recluse：可能被当作邪恶（无论原本阵营）
  if (roleId === "recluse") {
    return resolveRecluseForChef(seat.id, meta, ctx);
  }

  // Spy：可能被当作善良（不记为邪恶）
  if (roleId === "spy") {
    const registersAsGood = resolveSpyForChef(seat.id, meta, ctx);
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
  meta: Record<string, any>,
  ctx: MiddlewareContext
): number {
  const count = seats.length;
  if (count < 2) return 0;

  let pairs = 0;

  for (let i = 0; i < count; i++) {
    const current = seats[i];
    const next = seats[(i + 1) % count];

    const currentEvil = isEffectivelyEvil(current, meta, ctx);
    const nextEvil = isEffectivelyEvil(next, meta, ctx);

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
 * @param rng       确定性随机源（默认 Math.random，管线内传入按夜次播种的序列）。
 * @returns 虚假数字。
 */
export function generateFakePairCount(
  seats: PlayerLookup[],
  realCount: number | null,
  rng: DeterministicRandom = Math.random
): number {
  const max = Math.max(1, seats.length - 1);
  const candidates: number[] = [];

  for (let v = 0; v <= max; v++) {
    if (v !== realCount) candidates.push(v);
  }

  return candidates.length > 0
    ? candidates[Math.floor(rng() * candidates.length)]
    : Math.floor(rng() * (max + 1));
}

// ─── 「受干扰假值」唯一口径（引擎 / 提示预演 / 玩家结果页 三处共用）────────────
/**
 * 厨师假数字的候选上界（含）。
 * ⚠️ 必须与 `src/utils/corruptedInfo.ts` 的 `INFO_ROLE_KIND.chef.max` 一致——
 *    该常量已从 corruptedInfo 反向引用本处，禁止在两处各写一份字面量。
 */
export const CHEF_FAKE_MAX = 5;

/**
 * 厨师「受干扰假值」的唯一种子。
 *
 * ⚠️ 必须与 `utils/corruptedInfo.ts::buildCorruptedInfoMask` 使用的种子**逐字一致**
 *    （`corrupted-info|${nightInfoSeed(roleId, actorSeatId, nightCount)}`），
 *    否则「玩家结果页」会基于引擎假值**二次随机**，与「提示预演」的数字对不上。
 */
export function chefFakeSeed(seatId: number, nightCount: number): string {
  return `corrupted-info|${nightInfoSeed("chef", seatId, nightCount)}`;
}

/**
 * 厨师受干扰时的假对数：确定性、且**永不等于真值**（k>=2 的常规局面）。
 *
 * 语义与 `corruptedInfo.pickFakeNumber(trueValue, max, rng)` 完全一致
 * （候选池 0..max、排除真值、同一枚种子 → 同一结果），
 * 因此「提示预演」「引擎结算」「玩家结果页」三处必然给出同一个数字。
 *
 * ⚠️⚠️ 上界必须是**本局棋盘的物理上界**，不能是一个与棋盘无关的常量。
 *   官方要求说书人给「看似合理的数字」；旧实现固定用 `CHEF_FAKE_MAX`(=5)，
 *   在 7~8 人局（邪恶 2 人 → 相邻对最多 1 对）会给出「5 对」这种**物理不可能**的值。
 *   说书人照念 → 玩家立刻看出数字不可能 → **直接暴露厨师被醉酒/中毒**，
 *   而醉酒/中毒的全部意义就是「玩家不该知道」→ 信息泄漏级缺陷。
 *   正解：`max = 棋盘上注册为邪恶的人数 - 1`（邪恶全相邻时的相邻对数上限），
 *   并仍以 `CHEF_FAKE_MAX` 作为绝对上限兜底。
 *
 * @param realCount    真实邪恶相邻对数（null 表示未知，此时不排除任何值）
 * @param maxPlausible 本局棋盘物理上界（由 `chefMaxPlausiblePairs` 计算）
 */
export function pickChefFakePairCount(
  realCount: number | null,
  seatId: number,
  nightCount: number,
  maxPlausible: number = CHEF_FAKE_MAX
): number {
  const rng = createDeterministicRandom(chefFakeSeed(seatId, nightCount));
  const cap = Math.max(0, Math.min(maxPlausible, CHEF_FAKE_MAX));
  const candidates: number[] = [];
  for (let v = 0; v <= cap; v++) {
    if (v !== realCount) candidates.push(v);
  }
  // 候选池为空的**退化局面**：棋盘上只可能有 1 名邪恶（k<=1）→ 上限 0，
  // 而 0 恰是真值，不存在"看似合理且不等于真值"的数。
  // 此时返回 cap（=真值）→ 宁可让被干扰者拿到一个**不违反物理上界**的数，
  // 也不返回一个一眼假的数（后者会泄漏"我被干扰了"）。
  // 现实剧本每局至少 1 爪牙（k>=2），故该分支实际不可达。
  if (candidates.length === 0) return cap;
  return candidates[Math.floor(rng() * candidates.length)];
}

/**
 * 本局棋盘上「相邻邪恶对」的**物理上界**。
 *
 * 官方计数规则：k 名邪恶玩家若全部连续相邻成一段弧，则相邻对 = k-1
 * （例：3 连邪恶 = 2 对，4 连 = 3 对）；若全桌皆邪恶则 = 座位数。
 * 因此上界 = (注册为邪恶的人数 - 1)，且不超过 `CHEF_FAKE_MAX`。
 *
 * 注册口径与真值计算同源（`isEffectivelyEvil`，含陌客登记为邪恶、
 * 间谍登记为善良的干扰）→ 保证上界与真值同处一个视角。
 */
export function chefMaxPlausiblePairs(seats: PlayerLookup[]): number {
  const meta: Record<string, any> = {};
  const ctx = { snapshot: { seats } } as unknown as MiddlewareContext;
  const total = seats.length;
  if (total === 0) return 0;
  let evilCount = 0;
  for (const s of seats) {
    if (isEffectivelyEvil(s, meta, ctx)) evilCount++;
  }
  const boardBound = evilCount >= total ? total : Math.max(0, evilCount - 1);
  return Math.min(boardBound, CHEF_FAKE_MAX);
}

/**
 * 供「提示预演」路径（`roles/townsfolk/chef.ts` 的 dialog）复用的公开入口：
 * 用与引擎结算**完全相同**的算法统计相邻邪恶对数。
 *
 * 单一实现 → 杜绝「dialog 自算一份、引擎再算一份」的漂移。
 * 差异点已对齐：不再跳过厨师自身所在的相邻对（官方：邪恶对按全量座位判定，
 * 厨师本人若因伪装/转化而属于邪恶，其相邻对同样计入）。
 */
export function countChefEvilPairsForUi(seats: PlayerLookup[]): number {
  const meta: Record<string, any> = {};
  const ctx = { snapshot: { seats } } as unknown as MiddlewareContext;
  return countEvilPairs(seats, meta, ctx);
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

  // 🎲 确定性随机：同一夜、同一角色的重复计算（提示预演 / 实际执行 / 玩家结果页）
  // 必须得到**完全相同**的假数字，否则说书人照提示念的结果会与结果弹窗对不上。
  // ⚠️ 调用 `pickChefFakePairCount`（本文件唯一口径），不要各自造 rng。
  const seatId = context.actionNode.seatId;
  const nightCount = snapshot.nightCount ?? 1;

  let evilPairCount: number;
  /** 真值（说书人解锁视图用）。受干扰时 abilityResult 是假值，真值只落在这里。 */
  let truePairCount: number;

  // 优先级 1：说书人手动完全覆盖
  if (storytellerInput?.overrideResult !== undefined) {
    evilPairCount = storytellerInput.overrideResult as number;
    truePairCount = evilPairCount;
  }
  // 优先级 2：说书人预设假信息（仅当能力被干扰时使用）
  else if (!abilityEffective && storytellerInput?.fakeResult !== undefined) {
    evilPairCount = storytellerInput.fakeResult as number;
    truePairCount = countEvilPairs(seats, meta, context);
  }
  // 优先级 3：预置首夜信息
  else if (meta.initialNightInfo?.chefInfo !== undefined) {
    truePairCount = meta.initialNightInfo.chefInfo as number;
    evilPairCount = abilityEffective
      ? truePairCount
      : pickChefFakePairCount(
          truePairCount,
          seatId,
          nightCount,
          chefMaxPlausiblePairs(seats)
        );
  }
  // 优先级 4：动态计算
  else {
    truePairCount = countEvilPairs(seats, meta, context);
    // ⚠️ 假值必须**排除真值**：旧实现传 `null`（不排除），确定性种子下会
    //    恒定命中某个数字——一旦该数字恰好等于真值，中毒/醉酒玩家被直接
    //    告知真值（确定性信息泄漏，不是偶发）。
    evilPairCount = abilityEffective
      ? truePairCount
      : pickChefFakePairCount(
          truePairCount,
          seatId,
          nightCount,
          chefMaxPlausiblePairs(seats)
        );
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: evilPairCount,
      /** 真值（玩家不可见；供说书人解锁视图使用） */
      abilityResultTrue: truePairCount,
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
  const abilityLog = `厨师${tag}获得信息：场上有 ${result} 对相邻的邪恶玩家`;

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
        /** 玩家可见值（受干扰时已是假值） */
        evilPairCount: result,
        /**
         * 真值。受干扰时 `evilPairCount` 是假值，说书人解锁视图与
         * 「玩家结果页脱敏」都必须用这个真值作为排除口径，
         * 才能复现出与提示预演**同一个**假数字（避免二次随机）。
         */
        trueEvilPairCount:
          typeof meta.abilityResultTrue === "number"
            ? meta.abilityResultTrue
            : result,
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
