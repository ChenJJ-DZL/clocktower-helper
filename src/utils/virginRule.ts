/**
 * 贞洁者（Virgin）被动判据 —— 全仓唯一入口
 * ======================================================================
 * 官方原文（`src/data/officialRoleDocs.json` · 贞洁者）：
 *   「当你**首次**被提名时，如果提名你的玩家是**镇民**，他立刻被处决。」
 *   「只有镇民才会被贞洁者的能力处决。如果**外来者、爪牙或恶魔**提名了贞洁者，
 *     **无事发生**，并且提名流程会继续。」
 *   「当第一次被提名后，贞洁者会**失去能力**，即使发起提名者没有死亡，
 *     或者贞洁者处于醉酒或中毒状态。」
 *
 * 为什么抽出来：原实现把这段判据**内联在 `DayActionModal.tsx` 的 JSX onClick 里**，
 *   纯函数无法单测 ⇒ 「外来者提名贞洁者不该被处决」这类规则只能靠整局 E2E 偶然撞见。
 *   抽出后行为可测，组件只负责取值与弹窗。
 *
 * ⚠️ 酒鬼/提线木偶「以为自己是镇民」**不算镇民**（官方：能力不产生效果）——
 *   因此除了 `role.type === "townsfolk"`，还要排除 `drunk` 与永久醉酒状态。
 */

export interface VirginLikeSeat {
  id: number;
  isDead?: boolean | null;
  isDrunk?: boolean | null;
  isPoisoned?: boolean | null;
  role?: { id?: string | null; type?: string | null } | null;
  charadeRole?: { id?: string | null; type?: string | null } | null;
  statusEffects?: Array<{ type?: string | null; permanent?: boolean }> | null;
  /** 是否已被提名过（贞洁者首次被提名后永久失去能力） */
  hasBeenNominated?: boolean | null;
  [k: string]: unknown;
}

/** 有效角色（伪装身份优先） */
function effectiveRole(seat: VirginLikeSeat) {
  return seat.charadeRole ?? seat.role ?? null;
}

function isSeatDisabled(seat: VirginLikeSeat): boolean {
  if (seat.isDrunk === true || seat.isPoisoned === true) return true;
  return (seat.statusEffects ?? []).some(
    (e) => e?.type === "drunk" || e?.type === "poisoned" || e?.type === "poison"
  );
}

export interface VirginResolution {
  /** 是否要把「提名贞洁者」交给说书人裁决 */
  shouldPrompt: boolean;
  /** 是否为贞洁者**首次**被提名 */
  isFirstTime: boolean;
  /** 提名者是否为真镇民（决定提名者是否被处决） */
  nominatorIsTownsfolk: boolean;
  reason?: string;
}

/**
 * 解析「提名贞洁者」这一刻的处理方式。
 *
 * @param virginSeat    被提名的贞洁者座位
 * @param nominatorSeat 发起提名的座位
 */
export function resolveVirginTrigger(
  virginSeat: VirginLikeSeat | null | undefined,
  nominatorSeat: VirginLikeSeat | null | undefined
): VirginResolution {
  const reject = (reason: string): VirginResolution => ({
    shouldPrompt: false,
    isFirstTime: false,
    nominatorIsTownsfolk: false,
    reason,
  });

  if (!virginSeat) return reject("找不到被提名座位");
  if (effectiveRole(virginSeat)?.id !== "virgin") return reject("被提名者不是贞洁者");
  if (!nominatorSeat) return reject("找不到提名者");
  if (nominatorSeat.id === virginSeat.id) return reject("不能提名自己");

  const isFirstTime = virginSeat.hasBeenNominated !== true;
  const nominatorRole = effectiveRole(nominatorSeat);
  const nominatorIsTownsfolk =
    nominatorRole?.type === "townsfolk" &&
    nominatorRole?.id !== "drunk" &&
    !isSeatDisabled(nominatorSeat);

  /**
   * ⚠️ 即使贞洁者本人醉酒/中毒、或提名者不是镇民，也**要弹窗**：
   *   官方要求「第一次被提名后贞洁者就失去能力（即使当时醉酒/中毒）」——
   *   因此说书人必须知道这次提名发生过，只是裁决结果不同。
   *   是否真的处决提名者由 `nominatorIsTownsfolk && isFirstTime` 决定（见 `shouldExecuteNominator`）。
   */
  return {
    shouldPrompt: true,
    isFirstTime,
    nominatorIsTownsfolk,
  };
}

/**
 * 本次提名是否应当**处决提名者**。
 *
 * 官方三前提缺一不可：① 贞洁者**首次**被提名；② 提名者是**镇民**；
 * ③ 贞洁者本人未被醉酒/中毒（能力不生效）。
 */
export function shouldExecuteNominator(
  virginSeat: VirginLikeSeat | null | undefined,
  nominatorSeat: VirginLikeSeat | null | undefined
): boolean {
  const r = resolveVirginTrigger(virginSeat, nominatorSeat);
  if (!r.shouldPrompt || !r.isFirstTime || !r.nominatorIsTownsfolk) return false;
  if (!virginSeat) return false;
  return !isSeatDisabled(virginSeat);
}
