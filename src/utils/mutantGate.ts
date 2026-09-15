/**
 * 白天「畸形秀演员疯狂仲裁」门禁判定
 *
 * ============================================================================
 * 官方（`src/roles/outsider/mutant.ts`，梦殒春宵 · 外来者）：
 *   「如果你"疯狂"地证明自己是外来者，你可能被处决。」
 *   运作方式：「在游戏里的任何时间点（包括夜晚），如果你认为畸形秀演员
 *   "疯狂"地证明了他是一名外来者，那么你就可以决定处决畸形秀演员。
 *   ……**如果这次处决发生在白天的常规处决之前，则直接进入到夜晚阶段。**
 *   （每个白天最多能进行一次处决。）」
 *
 * 【本门禁要解决的问题（用户实测缺陷）】
 *   旧实现把畸形秀演员做成「玩家白天主动点击的日间能力」+ 一个通用的
 *   DayAbilityModal，说书人只有在玩家点了按钮之后才能仲裁；而且**白天可以
 *   不发动就直接进入黄昏**，与官方"说书人独立裁定"的语义不符。
 *
 * ⇒ 与洗脑师同构：**由说书人独立操作**、**白天必须完成裁定才能进入黄昏**。
 *   （见 `utils/cerenovusGate.ts`，同一套门禁思路。）
 *
 * ⚠️ 与洗脑师的关键差别（用户明确要求）：
 *   · 洗脑师是「被洗脑的玩家」被判定，判定失败 → 该**玩家**被处决；
 *   · 畸形秀演员是**说书人自己**决定是否处决**该畸形秀演员本人**。
 *   因此这里不需要「上一个夜晚设定的目标」这个中间态 —— 只要场上存在存活的
 *   畸形秀演员，且今天尚未裁定过，白天就必须先走一遍仲裁。
 */
import { isSeatAlive } from "./seatAlive";

export interface MutantGateSeat {
  id: number;
  isDead?: boolean | null;
  role?: {
    id?: string | null;
    type?: string | null;
    /** 酒鬼/提线木偶的伪装身份（权威字段） */
    name?: string | null;
  } | null;
  /** 酒鬼 / 提线木偶 以为自己是的角色（伪装成畸形秀演员时也算） */
  charadeRole?: { id?: string | null; name?: string | null } | null;
  /** 白天已使用过日间能力 */
  hasUsedDayAbility?: boolean;
  /** 今日已完成畸形秀演员疯狂仲裁 */
  mutantMadnessCheckedToday?: boolean;
}

export type MutantAlignmentish = unknown;

const isMutantLike = (s: MutantGateSeat): boolean => {
  const effectiveId = s.charadeRole?.id ?? s.role?.id;
  return effectiveId === "mutant";
};

/**
 * 白天是否必须先完成「畸形秀演员疯狂仲裁」才能进入黄昏。
 *
 * 需要门禁的三个条件（缺一不可）：
 *   ① 场上存在**存活的畸形秀演员**（含酒鬼/提线木偶伪装成畸形秀演员）；
 *   ② 该座位今日**尚未**完成仲裁（`mutantMadnessCheckedToday !== true`）；
 *   ③ 该座位**未被禁用**（死亡即不可处决 —— 已死者无需裁定）。
 *
 * ⚠️ 与洗脑师门禁一样，必须判「场上确实存在存活畸形秀演员」，
 *    否则上一局残留的 `mutantMadnessCheckedToday` 状态会把全新一局卡死在白天。
 */
export function hasPendingMutantMadnessCheck(
  seats: readonly MutantGateSeat[],
  _alignmentUnused?: MutantAlignmentish
): boolean {
  return seats.some(
    (s) =>
      isMutantLike(s) && isSeatAlive(s) && s.mutantMadnessCheckedToday !== true
  );
}

/** 取出需要仲裁的畸形秀演员座位 ID 列表（供控制台按钮列举）。 */
export function listPendingMutantSeats(
  seats: readonly MutantGateSeat[]
): number[] {
  return seats
    .filter(
      (s) =>
        isMutantLike(s) &&
        isSeatAlive(s) &&
        s.mutantMadnessCheckedToday !== true
    )
    .map((s) => s.id);
}

/**
 * 畸形秀演员是否"可以"被仲裁处决。
 *
 * 官方：说书人**自行判断**是否处决，因此这里不做阵营/状态限制 ——
 * 只要求座位存活（已死者不能被处决）。保留成独立函数是为了：
 *   ① 让 UI/测试有统一的判据入口；
 *   ② 将来若引入「畸形秀演员醉酒/中毒时不可被处决」之类规则，改一处即可。
 */
export function canJudgeMutantExecution(
  seat: MutantGateSeat | null | undefined
): boolean {
  if (!seat) return false;
  if (!isMutantLike(seat)) return false;
  return isSeatAlive(seat);
}
