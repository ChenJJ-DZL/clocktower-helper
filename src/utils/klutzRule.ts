/**
 * 呆瓜（Klutz）死亡判定 —— 全仓唯一判据入口
 * ======================================================================
 * 官方原文（`src/data/officialRoleDocs.json` · 呆瓜）：
 *   「当你得知你死亡时，你要公开选择一名存活的玩家：如果他是**邪恶的**，
 *     **你的阵营**落败。」
 *   「如果他选择了一名邪恶玩家，那游戏就立即结束，善良阵营落败。
 *     如果他选择了一名善良玩家，**无事发生**，游戏继续。」
 *
 * 🔴 2026-10-21 实测发现两件事：
 *   ① `KLUTZ_CHOICE` 弹窗（`KlutzChoiceModal`）**全仓没有任何触发点** ——
 *      `types/modal.ts` 有类型、`GameModals.tsx` 有渲染、`useConfirmHandlers` 有确认，
 *      但搜遍 `src/` 没有任何 `setCurrentModal({ type: "KLUTZ_CHOICE" })`
 *      ⇒ **呆瓜的核心能力在生产里永远不会发生**（同 `VIRGIN_TRIGGER` 的死路径形态）。
 *   ② 原确认逻辑把结果**写死**成「善良阵营立即失败」：
 *      ```
 *      isEvilPick ? `${...}邪恶，善良阵营立即失败` : `无事发生`
 *      ```
 *      官方措辞是「**你的阵营**落败」。呆瓜是外来者（善良）时两者一致，
 *      但若呆瓜被转为邪恶（`isEvilConverted` / 阵营转换），
 *      选中邪恶玩家时该落败的是**邪恶**阵营 —— 写死就会判反。
 */

export interface KlutzLikeSeat {
  id: number;
  isDead?: boolean | null;
  isDrunk?: boolean | null;
  isPoisoned?: boolean | null;
  isEvilConverted?: boolean | null;
  isGoodConverted?: boolean | null;
  role?: { id?: string | null; type?: string | null } | null;
  charadeRole?: { id?: string | null; type?: string | null } | null;
  statusEffects?: Array<{ type?: string | null }> | null;
  [k: string]: unknown;
}

type Alignment = "good" | "evil";

function effectiveRole(seat: KlutzLikeSeat) {
  return seat.charadeRole ?? seat.role ?? null;
}

/** 座位的真实阵营（转换标记优先，其次角色类型） */
export function alignmentOf(seat: KlutzLikeSeat): Alignment {
  if (seat.isEvilConverted === true) return "evil";
  if (seat.isGoodConverted === true) return "good";
  const type = effectiveRole(seat)?.type;
  if (type === "demon" || type === "minion") return "evil";
  return "good";
}

export interface KlutzOutcome {
  /** 选中的玩家是否为邪恶 */
  pickedEvil: boolean;
  /** 是否因此立即结束游戏 */
  gameOver: boolean;
  /** 落败的阵营（`gameOver` 为 false 时无意义） */
  losingAlignment: Alignment | null;
  reason: string;
}

/**
 * 解析呆瓜的公开选择结果。
 *
 * @param klutzSeat 呆瓜座位（用于判定「你的阵营」）
 * @param pickedSeat 被选择的玩家
 */
export function resolveKlutzOutcome(
  klutzSeat: KlutzLikeSeat | null | undefined,
  pickedSeat: KlutzLikeSeat | null | undefined
): KlutzOutcome {
  if (!klutzSeat) {
    return { pickedEvil: false, gameOver: false, losingAlignment: null, reason: "找不到呆瓜座位" };
  }
  if (!pickedSeat) {
    return { pickedEvil: false, gameOver: false, losingAlignment: null, reason: "未选择玩家" };
  }
  if (pickedSeat.isDead === true) {
    return {
      pickedEvil: false,
      gameOver: false,
      losingAlignment: null,
      reason: "官方要求选择一名**存活**玩家",
    };
  }

  const pickedEvil = alignmentOf(pickedSeat) === "evil";
  if (!pickedEvil) {
    return {
      pickedEvil: false,
      gameOver: false,
      losingAlignment: null,
      reason: "选中善良玩家 ⇒ 无事发生，游戏继续",
    };
  }

  const klutzAlignment = alignmentOf(klutzSeat);
  return {
    pickedEvil: true,
    gameOver: true,
    losingAlignment: klutzAlignment,
    reason: `选中邪恶玩家 ⇒ 呆瓜所在阵营（${klutzAlignment === "evil" ? "邪恶" : "善良"}）落败`,
  };
}
