/**
 * 恶魔攻击免疫工具（Demon Kill Immunity）
 *
 * 官方规则：
 * - 士兵（Soldier）"恶魔的负面能力对你无效" → 恶魔在夜晚攻击士兵，士兵不死亡。
 * - 镇长（Mayor）"如果至少3名玩家存活，你在夜晚不会死亡" →
 *   恶魔在夜晚攻击镇长时，若存活玩家数 ≥ 3，镇长不死亡（免疫恶魔的刀）。
 * - 两者醉酒/中毒时免疫可能失效（由调用方传入已计算好的状态）。
 *
 * 所有恶魔杀人逻辑（imp/po/zombuul/shabaloth/pukka/fang_gu/no_dashii/
 * vigormortis/vortox 等）都必须调用本工具检查目标是否为士兵/镇长。
 */

interface SoldierCheckSeat {
  role?: { id?: string; name?: string } | null;
  effectiveRole?: { id?: string; name?: string } | null;
  charadeRole?: { id?: string; name?: string } | null;
  isDead?: boolean;
  isAlive?: boolean;
  statusEffects?: Array<{ type?: string }>;
  isProtected?: boolean;
  [key: string]: any;
}

/**
 * 判断目标是否为"士兵"（考虑伪装/醉酒角色）。
 * 伪装角色（charadeRole）为士兵时，按官方规则酒鬼以为自己是士兵，
 * 但酒鬼没有士兵能力 → 不免疫。真实角色为士兵才免疫。
 */
export function isSoldierSeat(seat: SoldierCheckSeat | undefined): boolean {
  if (!seat) return false;
  return seat.role?.id === "soldier";
}

/**
 * 判断目标是否为"镇长"（真实角色）。
 */
export function isMayorSeat(seat: SoldierCheckSeat | undefined): boolean {
  if (!seat) return false;
  return seat.role?.id === "mayor";
}

/**
 * 判断目标是否应免疫恶魔攻击。
 * - 士兵且未死亡（且未醉/毒）→ 免疫。
 * - 镇长且未死亡（且未醉/毒）且存活玩家数 ≥ 3 → 免疫（官方规则）。
 *
 * @param seat 目标座位
 * @param checkStatus 是否检查醉酒/中毒状态（默认 true）
 *                    部分调用方已单独处理状态，可传 false 仅判断角色
 * @param aliveCount 当前存活玩家数（含目标）。镇长免疫需要；缺省时
 *                   仅对士兵免疫生效，镇长免疫退化为不触发（保守）
 */
export function isImmuneToDemonKill(
  seat: SoldierCheckSeat | undefined,
  checkStatus = true,
  aliveCount?: number
): boolean {
  if (!seat) return false;
  if (seat.isDead) return false;
  if (checkStatus) {
    const effects = seat.statusEffects ?? [];
    const isDrunk = effects.some((e) => e.type === "drunk");
    const isPoisoned = effects.some((e) => e.type === "poisoned");
    // 兼容 legacy 字段
    const drunk = isDrunk || (seat as any).isDrunk === true;
    const poisoned = isPoisoned || (seat as any).isPoisoned === true;
    if (drunk || poisoned) return false;
  }
  // 士兵免疫：恶魔攻击士兵无效
  if (isSoldierSeat(seat)) return true;
  // 镇长免疫：至少3名玩家存活时，恶魔攻击镇长无效（免疫恶魔的刀）
  if (isMayorSeat(seat)) {
    return aliveCount !== undefined && aliveCount >= 3;
  }
  return false;
}

/**
 * 获取目标免疫类型（用于日志/测试断言）。
 * 返回 "soldier" | "mayor" | null
 */
export function getDemonKillImmunityType(
  seat: SoldierCheckSeat | undefined,
  aliveCount?: number
): "soldier" | "mayor" | null {
  if (!seat || seat.isDead) return null;
  if (isSoldierSeat(seat)) return "soldier";
  if (isMayorSeat(seat) && aliveCount !== undefined && aliveCount >= 3) {
    return "mayor";
  }
  return null;
}

/** 获取免疫提示文本（用于日志） */
export function soldierImmunityLog(seat: SoldierCheckSeat | undefined): string {
  if (!seat) return "";
  const id = (seat as any).id ?? "?";
  return `士兵(${Number(id) + 1}号)免疫了恶魔的攻击，存活了下来`;
}

/** 获取镇长免疫提示文本（用于日志） */
export function mayorImmunityLog(seat: SoldierCheckSeat | undefined): string {
  if (!seat) return "";
  const id = (seat as any).id ?? "?";
  return `镇长(${Number(id) + 1}号)因存活玩家不少于3人，免疫了恶魔的攻击，存活了下来`;
}
