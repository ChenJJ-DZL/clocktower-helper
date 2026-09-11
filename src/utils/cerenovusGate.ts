/**
 * 白天「疯狂洗脑」门禁判定（洗脑师技能）
 *
 * 规则：洗脑师白天必须完成【疯狂洗脑】判定后才能进入黄昏处决阶段。
 * 但只有「场上确实存在存活洗脑师」时才需要这道门禁 —— 否则上一局残留的
 * cerenovusTarget 会把全新一局卡死在白天（说书人无法进入黄昏）。
 */

export interface CerenovusGateSeat {
  id: number;
  isDead?: boolean;
  role?: { id?: string | null } | null;
}

export interface CerenovusGateTarget {
  targetId: number;
  roleName: string;
  checkedToday?: boolean;
}

export function hasPendingCerenovusCheck(
  seats: readonly CerenovusGateSeat[],
  cerenovusTarget: CerenovusGateTarget | null | undefined
): boolean {
  const hasAliveCerenovus = seats.some(
    (s) => s.role?.id === "cerenovus" && !s.isDead
  );
  if (!hasAliveCerenovus || !cerenovusTarget) return false;
  if (cerenovusTarget.checkedToday) return false;

  const targetSeat = seats.find((s) => s.id === cerenovusTarget.targetId);
  return !targetSeat?.isDead;
}
