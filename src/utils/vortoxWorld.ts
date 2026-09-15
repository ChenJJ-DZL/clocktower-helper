/**
 * 涡流（Vortox）「涡流世界」判定 —— 唯一事实来源（SST）
 *
 * 【官方规则】涡流（Vortox，恶魔）在场且**存活**时，所有信息类能力的结果为假。
 *   涡流死亡后，信息立即恢复正常。
 *   ⇒ 判定的两个必要条件：① 场上有涡流角色；② 该涡流**存活**。
 *
 * ⚠️ 2026-09-15 收口背景：
 *   本判定此前在项目里存在 **三份各写各的** 实现，其中一份漏掉存活检查：
 *     · `GameStage.tsx`            —— ❌ 漏了 `!isDead`（涡流死后仍判为涡流世界）
 *     · `roleActionHandlers.ts`    —— ✅ `s.role?.id === "vortox" && !s.isDead`
 *     · `useNightActionHandler.ts` —— ✅ 同上
 *   漏检的后果：涡流死后 `isVortoxWorld` 仍为 true，使
 *   `gameLogic.checkGameEnd` 的「涡流：今日无人被处决 → 邪恶获胜」**误触发**。
 *   ⇒ 与「提名资格」「存活判据」同属一类缺陷：**生命周期 ≠ 判定条件**。
 *
 * 所有调用点必须走本模块，禁止再内联 `s.role?.id === "vortox"`。
 */

export interface VortoxCheckSeat {
  role?: { id?: string | null } | null;
  /** 伪装角色：酒鬼 / 提线木偶「自认为」是涡流时，其信息同样按涡流世界处理 */
  charadeRole?: { id?: string | null } | null;
  /**
   * ⚠️ 兼容字段（老代码遗留）：部分钩子把「涡流」记在 `roleId` 而非 `role.id`。
   *    见 `useNightActionHandler.ts`。保留以维持行为一致。
   */
  roleId?: string | null;
  isDead?: boolean | null;
}

/**
 * 涡流世界是否生效。
 *
 * @param seats 当前座位列表
 * @returns 场上存在**存活**的涡流（或伪装成涡流的角色）时为 true
 */
export function isVortoxWorldActive(
  seats: readonly VortoxCheckSeat[] | null | undefined
): boolean {
  if (!seats) return false;
  return seats.some((s) => hasVortoxIdentity(s) && s.isDead !== true);
}

/** 该座位是否是（或自认为）涡流——不含存活判断 */
export function hasVortoxIdentity(seat: VortoxCheckSeat | null | undefined): boolean {
  if (!seat) return false;
  return (
    seat.role?.id === "vortox" ||
    seat.charadeRole?.id === "vortox" ||
    seat.roleId === "vortox"
  );
}

/**
 * 涡流「今日无人被处决 → 邪恶获胜」是否有效。
 * 与 `isVortoxWorldActive` 同源，供 checkGameEnd 的涡流分支使用。
 */
export function isVortoxDuskWinActive(
  seats: readonly VortoxCheckSeat[] | null | undefined,
  todayHasExecution: boolean
): boolean {
  return isVortoxWorldActive(seats) && !todayHasExecution;
}
