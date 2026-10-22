/**
 * ⚔️ 哈迪寂亚（Al-Hadikhia）的生死结算判据
 * ----------------------------------------------------------------------------
 * 官方【角色能力】：
 *   「每个夜晚*，你可以选择三名玩家（所有玩家都会得知你选了谁）：
 *     他们分别**秘密**决定自己的生死，然后如果他们都存活则都死亡。」
 * 官方【运作方式】：
 *   「宣布黄昏时存活但黎明时死亡的玩家死亡，
 *     **宣布黄昏时死亡但黎明时存活的玩家复活**。」
 *
 * 🔴 本项目此前的缺陷（2026-10-22）：只实现了「死」那一半 ——
 *   选「生」的**已死玩家**永远不会复活，与【运作方式】第二句相反。
 *
 * 抽成纯函数的原因：
 *   ① 这条规则有两个方向（杀 / 复活）且互相排斥，写在 hook 里既测不到也容易分叉；
 *   ② 黎明播报要用复活名单（`utils/dawnAnnouncement`），调用方需要一个稳定数组。
 */

export type HadesiaChoice = "live" | "die";

export interface HadesiaOutcome {
  /** 本夜要死亡的座位（0 基） */
  killIds: number[];
  /** 本夜要复活的座位（0 基）—— 只可能是「选生且当前已死」的玩家 */
  reviveIds: number[];
  /** 三人都选「生」⇒ 按规则三人全部死亡（此时不存在复活） */
  allLive: boolean;
}

/**
 * @param targetIds    恶魔选中的三名玩家
 * @param choices      每人选择；缺省视为「生」（弹窗默认值）
 * @param isSeatDead   当前座位是否已死亡（由调用方读最新座位）
 */
export function resolveHadesiaOutcome(
  targetIds: number[],
  choices: Record<number, HadesiaChoice>,
  isSeatDead: (seatId: number) => boolean
): HadesiaOutcome {
  const ids = Array.isArray(targetIds) ? targetIds : [];
  const choiceOf = (id: number): HadesiaChoice =>
    choices?.[id] === "die" ? "die" : "live";

  const allLive = ids.length > 0 && ids.every((id) => choiceOf(id) === "live");

  // 三人都选「生」⇒ 三人全死（官方：如果他们都存活则都死亡）
  if (allLive) {
    return { killIds: [...ids], reviveIds: [], allLive: true };
  }

  const killIds = ids.filter((id) => choiceOf(id) === "die");
  // 「生」的**已死**玩家 ⇒ 黎明复活（官方【运作方式】第二句）
  const reviveIds = ids.filter(
    (id) => choiceOf(id) === "live" && Boolean(isSeatDead(id))
  );

  return { killIds, reviveIds, allLive: false };
}
