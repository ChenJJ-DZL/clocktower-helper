/**
 * 🪬 灵言师（Shaman / Mezepheles）转化判据 —— 全仓唯一入口
 * ======================================================================
 * 官方原文（`src/data/officialRoleDocs.json` · 灵言师）：
 *   「每个夜晚*，你要告知说书人一个词。**第一个**说出这个词的善良玩家，
 *     会在**今晚**变成邪恶。」
 *   「一旦有玩家说出这个词，这个词就不再有效。」
 *
 * 🔴 发现的两处缺陷（2026-10-21）：
 *   ① `SHAMAN_CONVERT` 弹窗**全仓没有生产点**（右键菜单没有入口、控制台也没有）
 *      ⇒ 转化流程在生产里不可达；
 *   ② 弹窗即便被打开，写的是 `isEvil: true` —— 该字段**不是**阵营判据的输入。
 *      全仓阵营判据唯一权威 `utils/seatAlignment` 只认 `isEvilConverted`
 *      ⇒ 点了「确认转变」日志写了、阵营没变（假生效）。
 */

export interface ShamanSeatLike {
  id: number;
  isDead?: boolean | null;
  role?: { id?: string | null; type?: string | null } | null;
  charadeRole?: { id?: string | null; type?: string | null } | null;
  isEvilConverted?: boolean | null;
  reminderTokens?: Array<{ name?: string | null; sourceRole?: string | null }> | null;
}

/** 灵言师转化标记（写在被转化者身上的提醒标记，兼作「本局已用」判据） */
export const SHAMAN_CONVERSION_TOKEN_NAME = "被视为邪恶(灵言师)";

function effectiveType(seat: ShamanSeatLike): string | null {
  const role = seat.charadeRole ?? seat.role ?? null;
  return role?.type ?? null;
}

/** 场上是否有灵言师（存活）—— 没有就不该有转化入口 */
export function hasLivingShaman(
  seats: readonly ShamanSeatLike[]
): ShamanSeatLike | null {
  return (
    seats.find(
      (s) => s.role?.id === "shaman" && s.isDead !== true
    ) ?? null
  );
}

/** 本局是否已经有玩家被转化（官方：这个词不再有效） */
export function isShamanConversionSpent(
  seats: readonly ShamanSeatLike[]
): boolean {
  return seats.some(
    (s) =>
      s.isEvilConverted === true ||
      (s.reminderTokens ?? []).some(
        (t) =>
          t?.name === SHAMAN_CONVERSION_TOKEN_NAME ||
          t?.sourceRole === "shaman"
      )
  );
}

/** 入口判据：能不能打开「关键词被说出」弹窗 */
export function canOpenShamanConvert(input: {
  seats: readonly ShamanSeatLike[];
  gamePhase: string;
}): { allowed: boolean; reason?: string } {
  if (input.gamePhase === "setup" || input.gamePhase === "scriptSelection") {
    return { allowed: false, reason: "设置阶段没有灵言师转化" };
  }
  if (!hasLivingShaman(input.seats)) {
    return { allowed: false, reason: "场上没有存活的灵言师" };
  }
  if (isShamanConversionSpent(input.seats)) {
    return { allowed: false, reason: "本局关键词已经被说出过（不再生效）" };
  }
  return { allowed: true };
}

export type ShamanConversionOutcome =
  /** 善良玩家说出关键词 ⇒ 当晚起变成邪恶 */
  | "converted"
  /** 说出者本就是邪恶 ⇒ 不产生额外效果 */
  | "already_evil"
  /** 本局已经用过 ⇒ 不生效 */
  | "spent"
  /** 找不到目标 */
  | "invalid";

export interface ShamanConversionResolution {
  outcome: ShamanConversionOutcome;
  /** 需要写回座位的字段（唯一权威：`isEvilConverted`） */
  patch: Record<string, unknown> | null;
  reason: string;
}

/**
 * 结算一次「关键词被说出」。
 *
 * ⚠️ 判据只看**真实身份**（镇民/外来者 = 善良），不看 `isEvilConverted`
 *    —— 已经被转过的人再说一次不该重复触发（`spent` 已在入口拦）。
 */
export function resolveShamanConversion(input: {
  seats: readonly ShamanSeatLike[];
  targetId: number;
}): ShamanConversionResolution {
  if (isShamanConversionSpent(input.seats)) {
    return {
      outcome: "spent",
      patch: null,
      reason: "本局关键词已经生效过，后续说出者不再转化",
    };
  }
  const target = input.seats.find((s) => s.id === input.targetId);
  if (!target) {
    return { outcome: "invalid", patch: null, reason: "目标座位不存在" };
  }
  if (target.isDead === true) {
    return {
      outcome: "invalid",
      patch: null,
      reason: "目标已死亡，无法转化",
    };
  }
  const t = effectiveType(target);
  if (t !== "townsfolk" && t !== "outsider") {
    return {
      outcome: "already_evil",
      patch: null,
      reason: "说出者不是善良阵营，不产生额外效果",
    };
  }
  return {
    outcome: "converted",
    patch: {
      isEvilConverted: true,
      reminderTokens: [
        ...((target as any).reminderTokens ?? []),
        {
          id: `shaman_evil_${target.id}`,
          name: SHAMAN_CONVERSION_TOKEN_NAME,
          type: "poison",
          sourceRole: "shaman",
        },
      ],
    },
    reason: "善良玩家公开说出关键词，当晚起被视为邪恶",
  };
}
