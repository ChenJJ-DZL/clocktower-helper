/**
 * 座位存活判定（唯一事实来源）
 *
 * 背景：项目里同时存在 `isDead: true` 与 `isAlive: false` 两种「已死亡」标记方式，
 * 各处守卫只判断了其中一种，导致「已死亡玩家仍能发起/接受提名」这类规则违规
 * 从缝隙里漏过去。所有规则守卫统一走这里，杜绝再次分叉。
 */

export interface AliveCheckSeat {
  isDead?: boolean | null;
  isAlive?: boolean | null;
}

/** 该座位是否已死亡（同时兼容 isDead 与 isAlive 两种标记） */
export function isSeatDead(seat: AliveCheckSeat | null | undefined): boolean {
  if (!seat) return true;
  if (seat.isDead === true) return true;
  if (seat.isAlive === false) return true;
  return false;
}

/** 统计存活玩家数（只算已分配角色的座位） */
export function countAliveSeats(
  seats: readonly (AliveCheckSeat & {
    role?: { type?: string | null } | null;
  })[]
): number {
  return seats.filter((s) => s.role && !isSeatDead(s)).length;
}
