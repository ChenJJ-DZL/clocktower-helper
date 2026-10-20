/**
 * 吟游诗人（Minstrel）被动结算 —— 全仓唯一判据入口
 * ======================================================================
 * 官方原文（`src/data/officialRoleDocs.json` · 吟游诗人）：
 *   「当一名**爪牙死于处决**时，除了**你和旅行者**以外的**所有其他玩家**醉酒
 *     直到明天黄昏。」
 *   「如果爪牙在**夜晚**死亡，吟游诗人**不会**使人醉酒。」
 *   「如果一名**已死亡**的爪牙玩家被处决，吟游诗人的能力**不会**触发。」
 *   「如果一名爪牙玩家被处决但**没有死亡**，吟游诗人的能力**不会**触发。」
 *   「如果一名爪牙玩家在吟游诗人**醉酒或中毒**期间死于处决时，吟游诗人的能力**不会**触发。」
 *
 * 🔴🔴 2026-10-21 实测缺陷（用户质询「每个技能效果都发生了吗」时发现）：
 *   `useGameController` 夜晚结束处的实现是
 *     「**夜晚**有**镇民**死亡 ⇒ 让**爪牙**醉酒」
 *   —— 与官方**三处全反**：
 *     ① 触发事件错：夜晚死亡 ≠ 死于处决；
 *     ② 触发身份错：镇民 ≠ 爪牙；
 *     ③ 受罚对象错：只醉爪牙 ≠ 除吟游诗人与旅行者外的所有人。
 *   而且它写在**夜晚结束**分支里，用夜间死者判断「处决」，
 *   逻辑上不可能命中正确场景（处决发生在白天）。
 *
 * ⇒ 本模块提供唯一判据 `resolveMinstrelIntoxication()`，
 *   `killPlayer` 在**实际处决致死**后消费它。
 */

export interface MinstrelLikeSeat {
  id: number;
  isDead?: boolean | null;
  isDrunk?: boolean | null;
  isPoisoned?: boolean | null;
  role?: { id?: string | null; type?: string | null } | null;
  /** 酒鬼/提线木偶「以为自己是谁」 */
  charadeRole?: { id?: string | null; type?: string | null } | null;
  statusEffects?: Array<{ type?: string | null; permanent?: boolean }> | null;
  [k: string]: unknown;
}

/** 有效角色（伪装身份优先：酒鬼/木偶按「以为的角色」判定） */
function effectiveRole(seat: MinstrelLikeSeat) {
  return seat.charadeRole ?? seat.role ?? null;
}

/** 该座位是否被醉酒/中毒（effects 与遗留布尔位都要看，与 `abilityPriorityMiddleware` 同口径） */
function isSeatDisabled(seat: MinstrelLikeSeat): boolean {
  if (seat.isDrunk === true || seat.isPoisoned === true) return true;
  return (seat.statusEffects ?? []).some(
    (e) => e?.type === "drunk" || e?.type === "poisoned" || e?.type === "poison"
  );
}

/** 是否为旅行者（官方：旅行者不醉酒） */
function isTraveler(seat: MinstrelLikeSeat): boolean {
  return effectiveRole(seat)?.type === "traveler";
}

export interface MinstrelResolution {
  /** 是否触发（供日志/弹窗判断） */
  triggered: boolean;
  /** 未触发的原因（供日志与测试断言） */
  reason?: string;
  /** 需要被施加醉酒的座位 id（已排除吟游诗人本人与旅行者） */
  intoxicatedSeatIds: number[];
  /** 触发该效果的吟游诗人座位 id（多个吟游诗人时取第一个存活者） */
  minstrelSeatId?: number;
}

/**
 * 解析本次「处决致死」是否触发吟游诗人，以及谁该醉酒。
 *
 * @param seats          当前全场座位（**处决后**的座位，被处决者应已 `isDead: true`）
 * @param executedSeatId 本次被处决的座位 id
 * @param cause          致死原因；官方明确「夜晚死亡不触发」，故必须由调用方声明，
 *                       而不是让本函数靠「有没有走处决流程」隐式假设
 *                       （隐式假设正是原缺陷的温床）。
 */
export function resolveMinstrelIntoxication(
  seats: readonly MinstrelLikeSeat[],
  executedSeatId: number,
  cause: "execution" | "night" | "ability" = "execution"
): MinstrelResolution {
  const none = (reason: string): MinstrelResolution => ({
    triggered: false,
    reason,
    intoxicatedSeatIds: [],
  });

  if (cause !== "execution") {
    return none(`死因为「${cause}」，官方只在**死于处决**时触发`);
  }

  const minstrel = seats.find(
    (s) => effectiveRole(s)?.id === "minstrel" && s.isDead !== true
  );
  if (!minstrel) return none("场上没有存活的吟游诗人");

  if (isSeatDisabled(minstrel)) return none("吟游诗人醉酒/中毒，能力不生效");

  const executed = seats.find((s) => s.id === executedSeatId);
  if (!executed) return none("找不到被处决者座位");
  if (executed.isDead !== true) return none("被处决者并未死亡（如弄臣/士兵/魔鬼代言人保护）");

  const executedRole = effectiveRole(executed);
  if (executedRole?.type !== "minion") return none("被处决致死者不是爪牙");

  const intoxicatedSeatIds = seats
    .filter((s) => s.id !== minstrel.id && !isTraveler(s))
    .map((s) => s.id);

  return {
    triggered: true,
    intoxicatedSeatIds,
    minstrelSeatId: minstrel.id,
  };
}

/** 施加醉酒时写入的效果（幂等：同 source 不重复叠加） */
export const MINSTREL_DRUNK_SOURCE = "minstrel";
