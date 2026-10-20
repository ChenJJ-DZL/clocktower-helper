/**
 * 革命者（Revolutionary，Fabled）「被当作其他」判定 —— 唯一事实源（SST）
 * ==================================================================
 * 【官方原文·革命者】
 *   「公开声明一对**邻座**玩家本局游戏一直保持同一阵营。
 *     每局游戏限一次，他们中的一人**可能被当作**其他的角色/阵营。」
 *   【运作方式】「每局游戏限一次，你可以使被标记了"被当作其他"的玩家之一
 *     被当作另一个角色和/或阵营，然后移除"被当作其他"提示标记。」
 *
 * ⚠️ 语义边界（非常重要，勿越界）：
 *   ① **只影响「别人怎么看他」**——即其他角色的信息类能力对他的角色/阵营认知；
 *   ② **不影响真实角色/阵营**（该玩家本人的能力照常按真实身份运作）；
 *   ③ **不影响胜负判定**（胜负仍按真实阵营算，官方未改变任何胜利条件）。
 *
 * 2026-10-20 背景：旧 UI 只有 pair + 一个 `revolutionaryDisguiseUsed` 开关，
 *   没有「**哪一名**玩家被当作什么」的交互 ⇒ 效果无处落地，信息获取整条失真。
 *   ⇒ 补：`fabledState.revolutionaryDisguise`（seatId + asRoleId + asAlignment），
 *     并由本模块统一给出「被他人感知的角色/阵营」。
 */

export interface RevolutionaryDisguise {
  /** 被当作其他的那名玩家（pair 中的一人） */
  seatId: number;
  /** 被当作的角色 id（null = 不改角色认知） */
  asRoleId: string | null;
  /** 被当作的阵营（null = 不改阵营认知） */
  asAlignment: "good" | "evil" | null;
}

interface SnapshotLike {
  fabledState?: {
    revolutionaryDisguise?: RevolutionaryDisguise | null;
    revolutionaryDisguiseUsed?: boolean;
    revolutionaryPair?: { a: number; b: number } | null;
  } | null;
}

/** 当前生效的「被当作其他」（未使用/未配置 ⇒ null） */
export function getRevolutionaryDisguise(
  snapshot: SnapshotLike | null | undefined
): RevolutionaryDisguise | null {
  const d = snapshot?.fabledState?.revolutionaryDisguise;
  if (!d || typeof d.seatId !== "number") return null;
  if (!d.asRoleId && !d.asAlignment) return null;
  return d;
}

/**
 * 「他人感知到的该座位角色 id」。
 * 革命者未对该座位伪装 ⇒ 原样返回真实 roleId。
 */
export function perceivedRoleId(
  snapshot: SnapshotLike | null | undefined,
  seatId: number,
  realRoleId: string | null | undefined
): string | null {
  const d = getRevolutionaryDisguise(snapshot);
  if (d && d.seatId === seatId && d.asRoleId) return d.asRoleId;
  return realRoleId ?? null;
}

/**
 * 「他人感知到的该座位阵营」。
 * 革命者未伪装 ⇒ 由调用方按真实阵营判定（本函数返回 null 表示「无伪装」）。
 */
export function perceivedAlignment(
  snapshot: SnapshotLike | null | undefined,
  seatId: number
): "good" | "evil" | null {
  const d = getRevolutionaryDisguise(snapshot);
  if (d && d.seatId === seatId && d.asAlignment) return d.asAlignment;
  return null;
}
