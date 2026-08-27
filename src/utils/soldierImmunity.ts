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
/**
 * 判断目标是否应免疫恶魔攻击（士兵专属绝对免疫）。
 * - 士兵且未死亡（且未醉/毒）→ 免疫恶魔攻击。
 *
 * @param seat 目标座位
 * @param checkStatus 是否检查醉酒/中毒状态（默认 true）
 */
export function isImmuneToDemonKill(
  seat: SoldierCheckSeat | undefined,
  checkStatus = true,
  _aliveCount?: number
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
  if (isMayorSeat(seat) && (aliveCount === undefined || aliveCount >= 3)) {
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

export interface MayorDemonKillResolution {
  isMayor: boolean;
  /** true 表示触发了替死（由 substituteSeat 替代死亡），false 表示替死未触发（镇长自己死亡） */
  substituted: boolean;
  /** 被选中的替代死亡镇民座位（仅当 substituted 为 true 时有效） */
  substituteSeat: any | null;
  /** 结算原因代码 */
  reason:
    | "not_mayor"
    | "disabled_by_status"
    | "no_candidates"
    | "self_killed_5_percent"
    | "substituted_95_percent";
  /** 详细中文日志 */
  logMessage: string;
}

/**
 * 处理恶魔夜晚击杀镇长的替死机制。
 *
 * 规则要求（固定概率）：
 * - 5% 概率为镇长自己死亡（替死未生效）
 * - 95% 概率由一名存活且未受保护的镇民（Townsfolk）替代死亡
 * - 若镇长醉酒/中毒、或存活玩家不足3人、或场上无其他存活镇民可替代时，镇长自己死亡
 *
 * @param seats 全部座位快照
 * @param targetSeat 恶魔攻击的目标座位
 * @param aliveCount 当前存活人数
 * @param forcedRoll 可选的概率投掷覆盖（0~1），用于确定性单测或调试
 */
export function resolveMayorDemonKill(
  seats: any[],
  targetSeat: SoldierCheckSeat | undefined,
  aliveCount?: number,
  forcedRoll?: number
): MayorDemonKillResolution {
  if (!targetSeat || !isMayorSeat(targetSeat)) {
    return {
      isMayor: false,
      substituted: false,
      substituteSeat: null,
      reason: "not_mayor",
      logMessage: "",
    };
  }

  const mayorId = (targetSeat as any).id ?? 0;
  const mayorName = (targetSeat as any).playerName
    ? `${(targetSeat as any).playerName}(${mayorId + 1}号)`
    : `${mayorId + 1}号`;

  // 1. 醉酒/中毒检测
  const effects = targetSeat.statusEffects ?? [];
  const isDrunk =
    effects.some((e) => e.type === "drunk") ||
    (targetSeat as any).isDrunk === true;
  const isPoisoned =
    effects.some((e) => e.type === "poisoned") ||
    (targetSeat as any).isPoisoned === true;
  if (isDrunk || isPoisoned) {
    return {
      isMayor: true,
      substituted: false,
      substituteSeat: null,
      reason: "disabled_by_status",
      logMessage: `镇长【${mayorName}】处于${isPoisoned ? "中毒" : "醉酒"}状态，替死能力失效，镇长自己死亡`,
    };
  }

  // 2. 存活人数检测（至少3人存活）
  const actualAliveCount =
    aliveCount ?? seats.filter((s: any) => !s.isDead).length;
  if (actualAliveCount < 3) {
    return {
      isMayor: true,
      substituted: false,
      substituteSeat: null,
      reason: "no_candidates",
      logMessage: `存活玩家不足3人(${actualAliveCount}人)，镇长【${mayorName}】替死能力未生效，镇长自己死亡`,
    };
  }

  // 3. 寻找可替代死亡的存活玩家（官方规则：可由除镇长外的任意其他存活玩家代为死亡）
  const candidates = seats.filter(
    (s: any) => s && !s.isDead && s.isAlive !== false && s.id !== mayorId
  );

  if (candidates.length === 0) {
    return {
      isMayor: true,
      substituted: false,
      substituteSeat: null,
      reason: "no_candidates",
      logMessage: `场上无其他可用存活玩家可替代死亡，镇长【${mayorName}】自己死亡`,
    };
  }

  // 4. 固定概率判定：5% 自己死亡，95% 镇民替代死亡
  const roll = forcedRoll !== undefined ? forcedRoll : Math.random();
  if (roll < 0.05) {
    return {
      isMayor: true,
      substituted: false,
      substituteSeat: null,
      reason: "self_killed_5_percent",
      logMessage: `镇长【${mayorName}】替死判定未触发(5%概率)，镇长自己死亡`,
    };
  }

  // 95% 概率：随机选取一名存活镇民替代死亡
  const substitute = candidates[Math.floor(Math.random() * candidates.length)];
  const subName = substitute.playerName
    ? `${substitute.playerName}(${substitute.id + 1}号)`
    : `${substitute.id + 1}号`;
  const subRoleName = substitute.role?.name || "镇民";

  return {
    isMayor: true,
    substituted: true,
    substituteSeat: substitute,
    reason: "substituted_95_percent",
    logMessage: `镇长【${mayorName}】触发替死能力(95%概率)，【${subName}-${subRoleName}】替代死亡`,
  };
}

/**
 * 兼容旧接口：镇长免疫恶魔攻击时，选择一名替代死亡的镇民（Townsfolk）。
 */
export function pickMayorSubstitute(
  seats: any[],
  mayorSeat: SoldierCheckSeat
): any | null {
  if (!seats || !mayorSeat) return null;
  const res = resolveMayorDemonKill(seats, mayorSeat, undefined, 1.0); // force substitute
  return res.substituteSeat;
}

/** 镇长替代死亡提示文本（用于日志） */
export function mayorSubstituteLog(
  substituteSeat: any,
  mayorSeat: any
): string {
  const subId = (substituteSeat as any)?.id ?? "?";
  const mayorId = (mayorSeat as any)?.id ?? "?";
  return `镇长(${Number(mayorId) + 1}号)触发替死能力(95%概率)，${
    Number(subId) + 1
  }号镇民替代死亡`;
}
