/**
 * 投票资格判定（唯一事实来源）
 *
 * 官方规则：死亡玩家全局仅保留 1 张幽灵票；用尽后不能再投票。
 * 组件内联实现会导致「确认按钮永久变灰」这类问题无法被测试覆盖，故抽出为纯函数。
 */

export interface VoteSeat {
  id: number;
  isDead?: boolean | null;
  hasGhostVote?: boolean | null;
}

/** 该座位当前是否已无法投票（已死亡且幽灵票用尽） */
export function isVoteInvalidSeat(
  seat: VoteSeat | null | undefined
): boolean {
  if (!seat) return true;
  return Boolean(seat.isDead && seat.hasGhostVote === false);
}

/**
 * 从已勾选列表中剔除已失效的座位（自愈）。
 * 用于「勾选时还有幽灵票 → 提交前被翻成 false」的场景：
 * 必须自动剔除，否则确认按钮会永久处于禁用态且无任何提示，
 * 把用户与自动化驱动逼进「投票 → 取消 → 重投」的死循环。
 */
export function pruneInvalidVoters<T extends VoteSeat>(
  selected: readonly number[],
  seats: readonly T[]
): { valid: number[]; pruned: number[] } {
  const valid: number[] = [];
  const pruned: number[] = [];
  for (const id of selected) {
    const seat = seats.find((s) => s.id === id);
    if (isVoteInvalidSeat(seat)) pruned.push(id);
    else valid.push(id);
  }
  return { valid, pruned };
}