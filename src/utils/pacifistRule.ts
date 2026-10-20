/**
 * 和平主义者（Pacifist）处决豁免 —— 全仓唯一判据入口
 * ======================================================================
 * 官方原文（`src/data/officialRoleDocs.json` · 和平主义者）：
 *   「**被处决的善良玩家可能不会死亡**。」
 *   「当一名善良玩家被处决时，**说书人选择**该玩家是死亡还是存活。」
 *   「如果一名玩家被处决但依然存活，也**仍然算作今天白天的处决**。
 *     今天不能再发起其他的提名了。」
 *
 * 原实现把判据内联在 `useExecutionHandlers` 的处决分支里：
 *   `seats.find(s => s.role?.id === "pacifist" && !s.isDead && !isActorDisabledByPoisonOrDrunk(s))`
 *   + `isGoodAlignment(executed)`
 * 逻辑正确，但**无法单测**（决策点是说书人弹窗，判据却埋在 hook 里）。
 * 抽出的另一个好处：把「应当弹窗」与「弹窗结果如何影响流程」分开表述。
 *
 * ⚠️ 「处决未死也算今日已处决」这一条**不在本函数**里 ——
 *   它属于流程语义（消耗当日名额），见 `isExecutionSlotConsumed()`。
 */

export interface PacifistLikeSeat {
  id: number;
  isDead?: boolean | null;
  isDrunk?: boolean | null;
  isPoisoned?: boolean | null;
  role?: { id?: string | null; type?: string | null } | null;
  charadeRole?: { id?: string | null; type?: string | null } | null;
  statusEffects?: Array<{ type?: string | null }> | null;
  [k: string]: unknown;
}

function effectiveRole(seat: PacifistLikeSeat) {
  return seat.charadeRole ?? seat.role ?? null;
}

function isSeatDisabled(seat: PacifistLikeSeat): boolean {
  if (seat.isDrunk === true || seat.isPoisoned === true) return true;
  return (seat.statusEffects ?? []).some(
    (e) => e?.type === "drunk" || e?.type === "poisoned"
  );
}

function isGoodSeat(seat: PacifistLikeSeat): boolean {
  if (seat.isEvilConverted === true) return false;
  if (seat.isGoodConverted === true) return true;
  const type = effectiveRole(seat)?.type;
  return !(type === "demon" || type === "minion");
}

export interface PacifistCheck {
  /** 是否需要弹窗让说书人裁决「救 / 不救」 */
  shouldPrompt: boolean;
  /** 触发该能力的和平主义者座位 */
  pacifistSeatId?: number;
  reason?: string;
}

/**
 * 本次处决是否可以由和平主义者介入。
 *
 * 三前提：① 场上有存活的和平主义者；② 它未被醉酒/中毒；
 *        ③ **被处决者是善良阵营**（官方只说「善良玩家」）。
 */
export function checkPacifistSave(
  executedSeat: PacifistLikeSeat | null | undefined,
  seats: readonly PacifistLikeSeat[]
): PacifistCheck {
  if (!executedSeat) return { shouldPrompt: false, reason: "找不到被处决者" };

  const pacifist = seats.find(
    (s) => effectiveRole(s)?.id === "pacifist" && s.isDead !== true
  );
  if (!pacifist) return { shouldPrompt: false, reason: "场上没有存活的和平主义者" };
  if (isSeatDisabled(pacifist)) {
    return { shouldPrompt: false, reason: "和平主义者醉酒/中毒，能力不生效" };
  }
  if (!isGoodSeat(executedSeat)) {
    return { shouldPrompt: false, reason: "被处决者不是善良阵营" };
  }
  return { shouldPrompt: true, pacifistSeatId: pacifist.id };
}

/**
 * 「处决未死」是否仍然消耗当日处决名额。
 *
 * 官方：「如果一名玩家被处决但依然存活，也仍然算作今天白天的处决。
 *       今天不能再发起其他的提名了。」⇒ 恒为 true。
 *
 * 单独抽成函数是为了让这条**容易被漏掉的流程语义**有名字、可被断言；
 * 任何「因为没死人所以放开第二次提名」的实现都会在测试里暴露。
 */
export function isExecutionSlotConsumed(
  outcome: "died" | "saved" | "not_executed"
): boolean {
  return outcome === "died" || outcome === "saved";
}
