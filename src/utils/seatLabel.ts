/**
 * 座位标签工具
 *
 * 背景：建局时所有座位都会被填入系统占位名「玩家 N」(见
 * src/components/game/setup/ScriptSelection.tsx 的 startFreshGame)，
 * 而项目目前没有任何重命名入口。占位名与座位号表达的是同一信息，
 * 因此「2号 (玩家 2)」这类展示属于纯重复文案。
 *
 * 这里把展示规则收敛到一处：占位名不参与展示；将来一旦接入真实姓名，
 * 无需改动调用方即可自动恢复展示。
 */

/** 由 seatId(0 起) 推出系统占位名候选。 */
function placeholderNames(seatId: number): string[] {
  const seatNo = seatId + 1;
  return [`玩家${seatNo}`, `玩家 ${seatNo}`];
}

/** 该玩家名是否为系统占位名（空值同样视为占位）。 */
export function isPlaceholderPlayerName(
  playerName: string | null | undefined,
  seatId: number
): boolean {
  const name = (playerName ?? "").trim();
  if (!name) return true;
  return placeholderNames(seatId).includes(name);
}

/** 展示用玩家名：占位名一律返回空串，真实姓名去除首尾空白。 */
export function displayPlayerName(
  playerName: string | null | undefined,
  seatId: number
): string {
  const name = (playerName ?? "").trim();
  return isPlaceholderPlayerName(name, seatId) ? "" : name;
}

/** 展示用座位标签：无有效姓名时为「2号」，否则为「2号 (张三)」。 */
export function formatSeatLabel(
  seatId: number,
  playerName?: string | null
): string {
  const base = `${seatId + 1}号`;
  const name = displayPlayerName(playerName, seatId);
  return name ? `${base} (${name})` : base;
}
