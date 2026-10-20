/**
 * 主谋（Mastermind）额外一天结算 —— 全仓唯一判据入口
 * ======================================================================
 * 官方原文（`src/data/officialRoleDocs.json` · 主谋）：
 *   「如果恶魔因为**死于处决**而因此导致游戏结束时，
 *     **再额外进行一个夜晚和一个白天**。
 *     在那个白天如果**有玩家被处决**，**他的阵营落败**。」
 *   「在下一个白天，如果一名**善良玩家**被处决——无论该玩家是否死于处决——
 *     **邪恶阵营获胜**。如果一名**邪恶玩家**被处决，或者**没有人被处决**，
 *     则**善良阵营获胜**。」
 *   「如果恶魔死亡且**只剩余两名存活玩家**，游戏仍然会**额外进行一天**——
 *     邪恶阵营不会因为只剩两名存活玩家而获胜，
 *     而善良阵营也不会因为杀死了恶魔而获胜。」
 *
 * 🔴🔴 2026-10-21 实测发现两处缺陷：
 *   ① `app/gameLogic.ts` 里「额外一天**无人被处决** ⇒ **邪恶**获胜」——
 *      官方明确是**善良**获胜，**判反**。
 *   ② 「额外白天有人被处决 ⇒ 其阵营落败」这条**完全没实现**：
 *      承载它的状态字段 `mastermindFinalDay` 只有 `setMastermindFinalDay(null)`
 *      一处调用、**从来没有任何地方把它设为 `{active:true}`**
 *      ⇒ 额外一天根本不会被标记，处决走的是常规判负规则。
 *      （与呆瓜 `KLUTZ_CHOICE`、贞洁者 `VIRGIN_TRIGGER` 同一类「死状态」形态。）
 */

export interface MastermindLikeSeat {
  id: number;
  isDead?: boolean | null;
  role?: { id?: string | null; type?: string | null } | null;
  charadeRole?: { id?: string | null; type?: string | null } | null;
  [k: string]: unknown;
}

function effectiveRole(seat: MastermindLikeSeat) {
  return seat.charadeRole ?? seat.role ?? null;
}

/** 座位阵营（转换标记优先，其次角色类型） */
function alignmentOf(seat: MastermindLikeSeat): "good" | "evil" {
  if ((seat as any).isEvilConverted === true) return "evil";
  if ((seat as any).isGoodConverted === true) return "good";
  const type = effectiveRole(seat)?.type;
  return type === "demon" || type === "minion" ? "evil" : "good";
}

/**
 * 是否应当进入「额外一夜一昼」。
 *
 * 两个前提：① 场上有存活且未中毒的主谋（由调用方判，`mastermindActive`）；
 *          ② **恶魔死于处决**（夜间死亡不触发，官方明确「因为死于处决」）。
 */
export function shouldEnterMastermindExtraDay(input: {
  mastermindActive: boolean;
  demonDiedByExecution: boolean;
}): boolean {
  return input.mastermindActive && input.demonDiedByExecution;
}

export interface MastermindExtraDayResult {
  winner: "good" | "evil";
  reason: string;
}

/**
 * 额外那天结束时的胜负。
 *
 * @param executedSeat 那个白天被处决的座位（无人被处决传 null）
 *
 * 官方：有人被处决 ⇒ **他的阵营落败**；无人被处决 ⇒ 善良获胜。
 */
export function resolveMastermindExtraDay(
  executedSeat: MastermindLikeSeat | null | undefined
): MastermindExtraDayResult {
  if (!executedSeat) {
    return {
      winner: "good",
      reason: "主谋额外一天：没有玩家被处决 ⇒ 善良阵营获胜",
    };
  }
  const alignment = alignmentOf(executedSeat);
  return alignment === "evil"
    ? {
        winner: "good",
        reason: `主谋额外一天：邪恶玩家（${executedSeat.id + 1}号）被处决 ⇒ 善良阵营获胜`,
      }
    : {
        winner: "evil",
        reason: `主谋额外一天：善良玩家（${executedSeat.id + 1}号）被处决 ⇒ 邪恶阵营获胜`,
      };
}
