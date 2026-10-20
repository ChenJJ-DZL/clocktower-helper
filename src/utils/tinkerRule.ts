/**
 * 修补匠（Tinker）自死判据 —— 全仓唯一入口
 * ======================================================================
 * 官方原文（`src/data/officialRoleDocs.json` · 修补匠）：
 *   「**你随时可能死亡**。」
 *   「说书人随时可以杀死修补匠。」
 *   「修补匠在**受到免于死亡的能力保护时，不能因自己的能力而死亡**。」
 *   范例：「茶艺师坐在修补匠和另一个善良玩家旁边，保护修补匠免于死亡。
 *          修补匠不会因为自己的能力而死亡。」
 *
 * ⇒ 说书人「随时可杀」是**主动权限**，但**保护优先级更高**：
 *   只要修补匠此刻处于「免死保护」下，就不能用**它自己的能力**把他杀死。
 *   （注意与「恶魔击杀」区分：被恶魔攻击时保护同样生效，那是通用击杀链，
 *     而「修补匠自死」是绕过普通攻击的额外死亡来源，本判据专门挡这一条。）
 */

export interface TinkerLikeSeat {
  id: number;
  isDead?: boolean | null;
  role?: { id?: string | null; type?: string | null } | null;
  charadeRole?: { id?: string | null; type?: string | null } | null;
  isProtected?: boolean | null;
  protectedBy?: string | null;
  statusEffects?: Array<{ type?: string | null; source?: string | null }> | null;
  [k: string]: unknown;
}

function effectiveRole(seat: TinkerLikeSeat) {
  return seat.charadeRole ?? seat.role ?? null;
}

/** 常见免死保护来源（效果标记形态） */
const PROTECTION_EFFECT_TYPES = new Set([
  "protected",
  "protection",
  "soldier_immune",
  "tea_lady_protection",
  "sailor_protection",
  "devils_advocate_protection",
  "innkeeper_protection",
]);

export interface TinkerDeathCheck {
  /** 是否允许「因修补匠自身能力」死亡 */
  canDie: boolean;
  reason?: string;
}

/**
 * 说书人此刻能否用「修补匠自身能力」让他死亡。
 *
 * @param tinkerSeat 修补匠座位
 * @param seats      全场座位（茶艺师等保护是**邻接**判据，需要全局视图）
 * @param hasAdjacentProtection 由调用方注入的保护判定（如茶艺师邻接保护），
 *        避免本模块反向依赖具体角色实现
 */
export function canTinkerDieByOwnAbility(
  tinkerSeat: TinkerLikeSeat | null | undefined,
  _seats: readonly TinkerLikeSeat[] = [],
  hasAdjacentProtection?: (seat: TinkerLikeSeat) => boolean
): TinkerDeathCheck {
  if (!tinkerSeat) return { canDie: false, reason: "找不到修补匠座位" };
  if (effectiveRole(tinkerSeat)?.id !== "tinker") {
    return { canDie: false, reason: "该座位不是修补匠" };
  }
  if (tinkerSeat.isDead === true) {
    return { canDie: false, reason: "修补匠已死亡" };
  }

  if (tinkerSeat.isProtected === true) {
    return {
      canDie: false,
      reason: `处于免死保护下（${tinkerSeat.protectedBy ?? "未知来源"}），不能因自身能力死亡`,
    };
  }

  const effectProtection = (tinkerSeat.statusEffects ?? []).find(
    (e) => typeof e?.type === "string" && PROTECTION_EFFECT_TYPES.has(e.type)
  );
  if (effectProtection) {
    return {
      canDie: false,
      reason: `处于免死保护下（效果 ${effectProtection.type}），不能因自身能力死亡`,
    };
  }

  if (hasAdjacentProtection?.(tinkerSeat)) {
    return {
      canDie: false,
      reason: "处于邻接保护（如茶艺师）下，不能因自身能力死亡",
    };
  }

  return { canDie: true };
}
