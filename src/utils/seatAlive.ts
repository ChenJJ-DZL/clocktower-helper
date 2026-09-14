/**
 * 座位存活判定（唯一事实来源）
 *
 * 背景：项目曾同时使用 `isDead: true` 与 `isAlive: false` 两种「已死亡」标记，
 * 各处守卫只判断其中一种，导致「已死亡玩家仍能发起/接受提名」这类规则违规从缝隙漏过。
 * 2026-09-14 已**统一为 `isDead` 单一标记**（`isAlive` 全仓移除）。
 * 本模块保留为唯一判死入口，后续新增守卫一律走这里，杜绝再次分叉。
 *
 * ⚠️ 2026-09-14 二次收口：曾另有 **两套**「是否存活」实现分散在
 *   · `bmrMechanics.ts::isAliveSeat`   —— `!seat.isDead`
 *   · `expansionMechanics.ts::isSeatAlive` —— `!seat.isDead`
 * 与权威 `isSeatDead`（`seat.isDead === true`）**语义等价但各自独立**，
 * 且 `!seat.isDead` 在 `isDead` 为 `undefined`/`null` 时与 `=== true` 判断路径不同
 * （虽当前等价，但一旦引入三态就会分叉）。两处已全部改为转发本模块。
 * ⇒ **`isAliveSeat` / `isSeatAlive` 只是薄转发别名，权威只在本文件。**
 */

export interface AliveCheckSeat {
  isDead?: boolean | null;
}

/** 该座位是否已死亡（唯一判据：isDead） */
export function isSeatDead(seat: AliveCheckSeat | null | undefined): boolean {
  if (!seat) return true;
  return seat.isDead === true;
}

/** ⭐ 该座位是否存活（= !isSeatDead）。全项目唯一存活判据，禁止内联 `!x.isDead`。 */
export function isSeatAlive(seat: AliveCheckSeat | null | undefined): boolean {
  return !isSeatDead(seat);
}

/**
 * @deprecated 历史别名，仅为兼容既有 import 保留；新代码请用 `isSeatAlive`。
 * 实际逻辑完全转发 `isSeatAlive`，不得在此另行实现。
 */
export function isAliveSeat(seat: AliveCheckSeat | null | undefined): boolean {
  return isSeatAlive(seat);
}

/** 统计存活玩家数（只算已分配角色的座位） */
export function countAliveSeats(
  seats: readonly (AliveCheckSeat & {
    role?: { type?: string | null } | null;
  })[]
): number {
  return seats.filter((s) => s.role && !isSeatDead(s)).length;
}
