/**
 * 梼杌替死工具（Taowu Substitute）
 *
 * 官方规则（wiki 2026-08-15 对齐）：
 *   "每个夜晚*，你要选择一名玩家：他死亡。当你将要死亡时，改为一名存活且
 *   具有能力的爪牙失去能力。你不会得知恶魔信息。"
 *
 * - 梼杌即将死亡（任何死亡来源：恶魔击杀/处决等）时：
 *   - 若存在"存活且具有能力"的爪牙 → 梼杌不死亡，随机一名这样的爪牙失去能力。
 *   - 若所有存活爪牙都不具有能力 → 梼杌仍然死亡。
 * - "具有能力"：爪牙未被中毒/醉酒/失去能力（statusEffects 含
 *   lost_ability / poisoned / drunk 均视为不具有能力）。
 *
 * 调用方：所有恶魔击杀路径（imp/po/zombuul/shabaloth/pukka 等）在标记
 * 梼杌死亡前调用 isTaowuSaved；处决路径同样（Wave D3 接入）。
 */

export interface TaowuSeatLike {
  id: number;
  role?: { id?: string; type?: string } | null;
  isDead?: boolean;
  isAlive?: boolean;
  statusEffects?: Array<{ type?: string }>;
  [key: string]: any;
}

/** 判断目标是否为梼杌（真实角色） */
export function isTaowuSeat(seat: TaowuSeatLike | undefined): boolean {
  return !!seat && seat.role?.id === "taowu";
}

/**
 * 判断爪牙是否"具有能力"（未被中毒/醉酒/失去能力）。
 */
export function isMinionCapable(seat: TaowuSeatLike | undefined): boolean {
  if (!seat || seat.isDead || seat.isAlive === false) return false;
  if (seat.role?.type !== "minion") return false;
  const effects = seat.statusEffects ?? [];
  const lost = effects.some(
    (e) =>
      e.type === "lost_ability" ||
      e.type === "poisoned" ||
      e.type === "drunk"
  );
  // 兼容 legacy 字段
  const legacyLost =
    (seat as any).isPoisoned === true || (seat as any).isDrunk === true;
  return !lost && !legacyLost;
}

/**
 * 梼杌替死：尝试让一名存活且有能力的爪牙失去能力，换取梼杌不死。
 *
 * @param seats 全部座位快照（将就地修改副本语义：返回新数组）
 * @param taowuSeat 梼杌座位
 * @returns { saved, seats } saved=true 表示替死成功（梼杌不死）；seats 为新座位数组
 */
export function tryTaowuSubstitute(
  seats: any[],
  taowuSeat: TaowuSeatLike
): { saved: boolean; seats: any[]; lostMinionId?: number } {
  if (!seats || !taowuSeat) return { saved: false, seats };

  const capableMinions = seats.filter((s: any) => isMinionCapable(s));
  if (capableMinions.length === 0) {
    return { saved: false, seats };
  }

  const victim =
    capableMinions[Math.floor(Math.random() * capableMinions.length)];
  const updated = seats.map((s: any) => {
    if (s.id === victim.id) {
      const effects = [...(s.statusEffects ?? [])];
      effects.push({
        type: "lost_ability",
        source: "taowu",
        sourceSeatId: taowuSeat.id,
      });
      return { ...s, statusEffects: effects };
    }
    return s;
  });

  return { saved: true, seats: updated, lostMinionId: victim.id };
}

/** 替死提示文本（用于日志） */
export function taowuSubstituteLog(
  taowuSeat: TaowuSeatLike,
  minionSeat: any
): string {
  const tId = Number((taowuSeat as any).id ?? 0) + 1;
  const mId = Number((minionSeat as any)?.id ?? 0) + 1;
  return `梼杌(${tId}号)将死，${mId}号爪牙失去能力，梼杌存活`;
}
