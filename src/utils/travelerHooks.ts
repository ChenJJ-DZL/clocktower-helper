/**
 * travelerHooks.ts —— 旅行者接线判据层（批 1：替罪羊 / 枪手）
 * ==================================================================
 * ⚠️ 范式铁律：旅行者**不占 seats**，只存在于 `state.travelers`
 *   （`(Role|null)[]`，定长 4；null = 空位/已离场）。
 *   因此判据一律以 `travelers` 数组为准，**禁止** `seats.find(role.id === ...)`。
 *
 * 本文件是**纯函数层**（无 React 依赖、可单测），宿主消费点：
 *   · 替罪羊 —— `useExecutionHandlers.ts::executePlayer`（处决结算，死亡落定前）
 *   · 枪手   —— `useExecutionHandlers.ts`（首次投票结算后 + 射击落定处）
 *
 * ── 旅行者 id 编码 ─────────────────────────────────────────────────
 * 旅行者没有座位 id，但处决记录字段 `todayExecutedId: number` 是数字。
 * 统一编码：`travelerExecutedId(index) = -(index + 1)`（-1..-4），
 * 永不与座位 id（≥ 0）冲突；消费方 `seats.find(s => s.id === x)` 查不到
 * 即安全 no-op，而「今日有人被处决」类判据（`todayExecutedId !== null`）语义正确。
 */
import type { Role, Seat } from "../../app/data";
import { isPlayerEvil } from "../../app/gameLogic";
import { canScapegoatSubstitute } from "./expansionMechanics";

/**
 * 旅行者阵营映射：key = `travelers` 槽位下标（0..3），value = 本局说书人指定的阵营。
 *
 * ⚠️ 为什么不用 `role.type` 表达：`role.type` 是**角色定义**的静态属性（一局内不变），
 *   而旅行者阵营是**本局选择**（每局可不同）；混用会污染角色表并牵连
 *   `resolveRoleType()` 等扁平兼容逻辑。故走独立 state，与 seats 解耦。
 */
export type TravelerAlignments = { [slot: number]: "good" | "evil" } | null | undefined;

/**
 * 旅行者阵营判据（唯一收口）。
 *
 * ⭐⭐ 背景（2026-10-16 P0 缺陷）：`utils/seatAlignment.ts:66` 把 `traveler`
 * 硬编码进 `GOOD_ROLE_TYPES` ⇒ 任何走 `isPlayerGood/isSeatGood` 的判定
 * 都把旅行者**永远判为善良**，邪恶旅行者无法表达。
 * ⇒ 旅行者阵营一律走本函数（读说书人指定的 `alignments`），**禁止**再走 seat 系判据。
 */
export function isTravelerEvil(
  alignments: TravelerAlignments,
  slot: number
): boolean {
  return alignments?.[slot] === "evil";
}

/**
 * travelers 索引 → **旅行者插槽 id**（负数编码，见文件头）。
 *
 * ⭐ 这是旅行者在「一切以数字 id 为键的流程」里的唯一表示：
 *   · 处决记录 `todayExecutedId`（`travelerExecutedId` 只是它的语义别名）
 *   · 投票者列表（旅行者可投票；投票 UI / 日志 / `votedThisRound` 都是 `number[]`）
 *   · 流放记录（`proposeExile({ targetKind: "traveler", targetId })` 复用同一编码）
 *   三处共用一份编码 ⇒ 任何一处改动都必须同时满足其它两处（单点定义在**这里**）。
 */
export function travelerSlotId(travelerIndex: number): number {
  return -(travelerIndex + 1);
}

/** 旅行者插槽 id → travelers 索引；非本编码返回 null */
export function travelerIndexOfSlotId(
  id: number | null | undefined
): number | null {
  if (typeof id !== "number" || !Number.isInteger(id) || id >= 0) return null;
  return -id - 1;
}

/** 是否为旅行者插槽 id（负数整数）。用于把「旅行者投票者」与「座位投票者」分流。 */
export function isTravelerSlotId(id: unknown): boolean {
  return typeof id === "number" && Number.isInteger(id) && id < 0;
}

/** 处决记录用的旅行者 id（= 插槽 id，保留旧名以免大面积改名） */
export function travelerExecutedId(travelerIndex: number): number {
  return travelerSlotId(travelerIndex);
}

/** 处决记录里的旅行者 id → travelers 索引；非本编码返回 null */
export function travelerIndexOfExecutedId(
  id: number | null | undefined
): number | null {
  return travelerIndexOfSlotId(id);
}

/** 存活的旅行者槽位（槽位非 null = 在场；旅行者的"死亡/离场"就是把槽位置 null） */
export interface TravelerSlot {
  /** 槽位下标 0..3 */
  index: number;
  /** 旅行者插槽 id（负数） */
  slotId: number;
  role: Role;
}

/**
 * 列出当前**在场**的旅行者槽位。
 *
 * ⚠️ 一切旅行者遍历都必须走本函数，**禁止** `seats.filter(s => s.role.type === "traveler")`
 *   —— 旅行者不占 seats，那种写法恒为空数组（本轮多次踩到）。
 */
export function listAliveTravelerSlots(
  travelers: (Role | null)[] | null | undefined
): TravelerSlot[] {
  if (!Array.isArray(travelers)) return [];
  const out: TravelerSlot[] = [];
  travelers.forEach((role, index) => {
    if (role) out.push({ index, slotId: travelerSlotId(index), role });
  });
  return out;
}

/** 场上是否存在某个旅行者角色（按 id；槽位非 null 即在场） */
export function hasTravelerRole(
  travelers: (Role | null)[] | null | undefined,
  roleId: string
): boolean {
  return listAliveTravelerSlots(travelers).some((t) => t.role.id === roleId);
}

/** 旅行者插槽 id → 该槽位的角色（不在场/非法返回 null） */
export function travelerRoleAtSlotId(
  travelers: (Role | null)[] | null | undefined,
  slotId: number | null | undefined
): Role | null {
  const index = travelerIndexOfSlotId(slotId);
  if (index === null || !Array.isArray(travelers)) return null;
  return travelers[index] ?? null;
}

/**
 * 统一的**投票者显示名**（座位与旅行者共用一套口径）。
 *
 * 座位 → `N号`（+ 玩家名）；旅行者 → `旅行者·角色名`。
 * 负数 id 若直接 `id + 1` 会打印出 `-1号` 这种无意义字样（本轮修复点）。
 */
export function formatVoterLabel(
  id: number,
  seats: (Seat | undefined)[] | null | undefined,
  travelers: (Role | null)[] | null | undefined
): string {
  if (isTravelerSlotId(id)) {
    const role = travelerRoleAtSlotId(travelers, id);
    return role ? `旅行者·${role.name}` : "旅行者(已离场)";
  }
  const seat = seats?.find?.((s) => s?.id === id);
  if (!seat) return `${id + 1}号`;
  const name = (seat as any).playerName;
  return name ? `${id + 1}号(${name})` : `${id + 1}号`;
}

// ══════════════════════════════════════════════════════════════════════
// 投票规则改写类旅行者（巫毒师）
// ══════════════════════════════════════════════════════════════════════

/**
 * 巫毒师（Voudon）投票资格判定。
 *
 * 官方原文（`parsed_roles.json`「巫毒师」）：
 *   「只有你和死亡的玩家可以投票，且投票不需要使用投票标记。
 *     忽略票数需要过半的要求。」
 *
 * ⭐ 三条规则拆成三个可执行谓词（避免只写时序描述）：
 *   ① 谁可以投票 —— **本函数**；
 *   ② 死亡玩家不消耗幽灵票 —— `voudonSkipsGhostVote()`；
 *   ③ 门槛视为 1（忽略过半） —— `voudonThreshold()`。
 *
 * @param voudonActive  场上是否有巫毒师（旅行者，不占 seats）
 * @param voterIsDead   投票者是否为**死亡玩家**（座位域；旅行者无此概念）
 * @param voterIsVoudon 投票者是否就是巫毒师本人
 */
export function voudonAllowsVoter(
  voudonActive: boolean,
  voterIsDead: boolean,
  voterIsVoudon: boolean
): boolean {
  // 无巫毒师 ⇒ 常规规则（人人可投票），不影响既有对局
  if (!voudonActive) return true;
  return voterIsDead || voterIsVoudon;
}

/** 巫毒师在场时，死亡玩家投票**不消耗**幽灵票（官方：不需要使用投票标记） */
export function voudonSkipsGhostVote(voudonActive: boolean): boolean {
  return voudonActive;
}

/**
 * 巫毒师在场时的上台门槛：官方「忽略票数需要过半的要求」
 * ⇒ 有效票 ≥ 1 即视为达标（阈值 1）。
 */
export function voudonThreshold(
  voudonActive: boolean,
  normalThreshold: number
): number {
  return voudonActive ? 1 : normalThreshold;
}

/** 替罪羊代刑候选（找到时返回旅行者位置与角色） */
export interface ScapegoatCandidate {
  travelerIndex: number;
  role: Role;
}

/**
 * 替罪羊（scapegoat_traveler）代刑判据。
 * 官方原文：「如果你的阵营的一名玩家被处决，你可能会代替他被处决。」
 *
 * 判据（全部满足才可代刑；「是否触发」由说书人主观裁决，不在本函数内）：
 *   1. `travelers` 中存在 `scapegoat_traveler`（非 null 即存活 —— 旅行者
 *      的死亡/离场表示就是把该槽位置 null，绝不读 seats）；
 *   2. 被处决者与替罪羊**同阵营**。
 *
 * ⭐⭐ 阵营判定口径（2026-10-16 修正）：
 *   替罪羊阵营走 `alignments[travelerIndex]`（说书人落座时指定），
 *   被处决者阵营走 `isPlayerEvil`（seat 系权威）。
 *   ⚠️ **不再**用 `canScapegoatSubstitute` —— 它内部走 `isPlayerGood`，
 *   而 `traveler` 被 `GOOD_ROLE_TYPES` 硬编码为善良 ⇒ 邪恶替罪羊永不触发代刑
 *   （官方规则静默失效）。该旧函数保留给 expansion 剧本测试，勿在此复用。
 *
 * @param travelers     `state.travelers`（定长 4，null = 空/已离场）
 * @param nominatedSeat 被处决者座位（seats 域）
 * @param alignments    旅行者阵营映射（说书人落座时逐个指定）
 * @returns 可代刑时返回替罪羊位置；否则 null（= 不触发，保持改动前行为）
 */
export function travelerScapegoatCanSubstitute(
  travelers: (Role | null)[] | null | undefined,
  nominatedSeat: Seat | null | undefined,
  alignments?: TravelerAlignments
): ScapegoatCandidate | null {
  if (!travelers || !nominatedSeat) return null;
  const travelerIndex = travelers.findIndex(
    (r) => r?.id === "scapegoat_traveler"
  );
  if (travelerIndex < 0) return null;
  const role = travelers[travelerIndex];
  if (!role) return null;
  const scapegoatEvil = isTravelerEvil(alignments, travelerIndex);
  const nominatedEvil = isPlayerEvil(nominatedSeat as any);
  if (scapegoatEvil !== nominatedEvil) return null;
  return { travelerIndex, role };
}

/**
 * 枪手（gunslinger）射击判据。
 * 官方原文：「每个白天，当首次投票被统计后，你可以选择一名刚投过票的玩家：他死亡。」
 *
 * 判据（全部满足才可射击）：
 *   1. `travelers` 中存在 `gunslinger`（非 null 即存活，不读 seats）；
 *   2. 目标是**刚投过票**的玩家 —— 即参与了本次投票结算的投票人
 *      （`justVotedSeatIds` 必须来自真实投票字段，禁止编造）；
 *   3. 「每个白天一次」的频次与「仅首次投票结算后」的时点由宿主 state
 *      （`travelerHookChoices.gunslingerUsedToday` / 当日首次结算标记）把关。
 *
 * @param travelers       `state.travelers`
 * @param justVotedSeatIds 本次投票结算的投票人座位 id 列表
 * @param targetSeatId    射击目标座位 id
 */
export function travelerGunslingerCanShoot(
  travelers: (Role | null)[] | null | undefined,
  justVotedSeatIds: number[] | null | undefined,
  targetSeatId: number | null | undefined
): boolean {
  if (!travelers || !Array.isArray(justVotedSeatIds)) return false;
  const gunslingerAlive = travelers.some((r) => r?.id === "gunslinger");
  if (!gunslingerAlive) return false;
  if (typeof targetSeatId !== "number") return false;
  return justVotedSeatIds.includes(targetSeatId);
}

/**
 * 枪手可选目标清单（UI 用）：本次投票结算的投票人 ∩ 判据通过者。
 * 内部转发 `travelerGunslingerCanShoot`，判据只有一份实现。
 */
export function travelerGunslingerEligibleTargets(
  travelers: (Role | null)[] | null | undefined,
  justVotedSeatIds: number[] | null | undefined
): number[] {
  if (!Array.isArray(justVotedSeatIds)) return [];
  return justVotedSeatIds.filter((seatId) =>
    travelerGunslingerCanShoot(travelers, justVotedSeatIds, seatId)
  );
}
