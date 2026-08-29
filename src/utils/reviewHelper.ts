import type { Seat, WinResult } from "../../app/data";
import { isPlayerEvil } from "../../app/gameLogic";

/**
 * 格式化获胜玩家名单
 * 格式：胜利玩家：xx号-角色、xx号-角色……
 */
export function getWinningPlayersList(
  seatsList: Seat[],
  winner: WinResult
): string {
  if (!winner) return "";
  const normalized = winner.toLowerCase();
  const activeSeats = (seatsList || []).filter((s) => s?.role);
  const winningSeats = activeSeats.filter((s) => {
    const isEvil = isPlayerEvil(s);
    return normalized === "evil" ? isEvil : !isEvil;
  });

  if (winningSeats.length === 0) return "";

  const playerRoster = winningSeats
    .map((s) => {
      let roleName = s.role?.name || "未知";
      if (s.role?.id === "drunk" && s.charadeRole?.name) {
        roleName = `酒鬼(伪:${s.charadeRole.name})`;
      } else if (s.role?.id === "lunatic" && s.apparentDemonRole?.name) {
        roleName = `疯子(伪:${s.apparentDemonRole.name})`;
      }
      return `${s.id + 1}号-${roleName}`;
    })
    .join("、");

  return `胜利玩家：${playerRoster}`;
}
