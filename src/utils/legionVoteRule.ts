/**
 * 军团（Legion）投票规则 —— 纯函数
 *
 * 官方（`officialRoleDocs`「军团」）：
 *   「每个夜晚*，可能有一名玩家死亡。**如果一项提名只有邪恶玩家投票，投票无效。**
 *     你也会被当作是爪牙。[多数玩家为军团]」
 *   运作：「如果一项提名中只有邪恶玩家参与了投票，那么在统计票数的时候会**记为零票**。」
 *
 * 抽成纯函数的原因：原实现内联在 `useExecutionHandlers.ts` 的 `submitVotes` 里
 * （hook 内部，无法单测）。抽出来后既可单测，也便于 UI 层复用同一判据。
 */

/** 最小座位形状（避免与 app/data 的 Seat 强耦合，便于测试构造） */
export interface LegionVoteSeat {
  id: number;
  role?: { id?: string; type?: string; team?: string } | null;
  isEvilConverted?: boolean;
  isDead?: boolean;
}

/**
 * 本次提名是否应因「军团：全邪恶投票」而记 0 票。
 *
 * 条件（三者同时满足）：
 *   1. 场上**有军团在场**（`role.id === "legion"`，含死亡也算"在场"，
 *      与 `checkGameEnd` 的 `hasLegionInPlay` 口径一致 —— 官方能力是"你也会被当作是爪牙"，
 *      只要本局是军团局，该规则即生效）；
 *   2. 本次投票有**至少 1 张有效票**（0 票本来就无效，无需此规则）；
 *   3. **所有**有效投票者均为邪恶阵营。
 *
 * 泛型说明：`S` 让调用方直接传 `Seat[]` + `(seat: Seat) => boolean`，
 * 无需为了适配最小形状而强转（此前 `Seat` 因字段更多而类型不兼容）。
 *
 * @param seats          全场座位
 * @param effectiveVoters 本次提名的**有效**投票者座位 id（已剔除幽灵票用尽/管家等无效票）
 * @param isEvil         判定阵营的函数（由调用方注入，避免本模块依赖 gameLogic）
 */
export function shouldZeroLegionVote<S extends LegionVoteSeat>(
  seats: readonly S[],
  effectiveVoters: readonly number[],
  isEvil: (seat: S) => boolean
): boolean {
  const hasLegionInPlay = seats.some((s) => s.role?.id === "legion");
  if (!hasLegionInPlay) return false;
  if (effectiveVoters.length === 0) return false;

  return effectiveVoters.every((id) => {
    const s = seats.find((seat) => seat.id === id);
    return s ? isEvil(s) : false;
  });
}
