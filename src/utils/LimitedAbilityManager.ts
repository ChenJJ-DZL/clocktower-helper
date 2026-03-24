// ======================================================================
//  限次能力统一管理器
// ======================================================================

/**
 * 限次能力定义接口
 */
export interface LimitedAbilityDefinition {
  /** 能力ID */
  abilityId: string;
  /** 使用次数限制（全局或实例级） */
  maxUses: number;
  /** 是否为全局限制（true: 全局共享次数，false: 每个玩家独立计数） */
  global: boolean;
  /** 是否在醉酒/中毒时也消耗次数（默认false） */
  consumeWhenDrunkOrPoisoned?: boolean;
  /** 角色变化时是否重置（默认true） */
  resetOnRoleChange?: boolean;
}

// 限次能力管理器状态
const globalUses = new Map<string, number>();
const instanceUses = new Map<string, Map<number, number>>();
const definitions = new Map<string, LimitedAbilityDefinition>();

/**
 * 预定义常见限次能力
 */
const predefinedDefinitions: LimitedAbilityDefinition[] = [
  // 哲学家：每局游戏一次
  {
    abilityId: "philosopher_use",
    maxUses: 1,
    global: false,
    resetOnRoleChange: true,
  },
  // 艺术家：每局游戏一次
  {
    abilityId: "artist_paint",
    maxUses: 1,
    global: false,
    resetOnRoleChange: true,
  },
  // 女裁缝：整局游戏一次（全局限制）
  {
    abilityId: "seamstress_ability",
    maxUses: 1,
    global: true,
    resetOnRoleChange: false,
  },
  // 呆瓜：全局限制一次猜测
  {
    abilityId: "minion_generic_guess",
    maxUses: 1,
    global: true,
    resetOnRoleChange: false,
  },
  // 教授：每局游戏一次
  {
    abilityId: "professor_resurrect",
    maxUses: 1,
    global: false,
    resetOnRoleChange: true,
  },
  // 沙巴洛斯：整局游戏一次"再次杀戮"能力
  {
    abilityId: "shabaloth_double_kill",
    maxUses: 1,
    global: true,
    resetOnRoleChange: false,
  },
];

/**
 * 初始化管理器，加载预定义能力
 */
export function initializeLimitedAbilityManager() {
  predefinedDefinitions.forEach((def) => {
    definitions.set(def.abilityId, def);
  });
}

/**
 * 注册自定义限次能力定义
 */
export function registerLimitedAbilityDefinition(
  definition: LimitedAbilityDefinition
) {
  definitions.set(definition.abilityId, definition);
}

/**
 * 检查能力是否可用
 * @param seatId 玩家ID（对于实例级能力）
 * @param abilityId 能力ID
 * @param customDefinition 可选的自定义定义（优先级高于预定义）
 * @returns 是否可用
 */
export function canUseLimitedAbility(
  seatId: number,
  abilityId: string,
  customDefinition?: LimitedAbilityDefinition
): boolean {
  const definition = customDefinition || definitions.get(abilityId);
  if (!definition) {
    // 如果没有定义，默认允许使用（向后兼容）
    return true;
  }

  if (definition.global) {
    const used = globalUses.get(abilityId) || 0;
    return used < definition.maxUses;
  } else {
    const seatUses = instanceUses.get(abilityId);
    if (!seatUses) {
      return true; // 该能力还没有任何玩家使用过
    }
    const used = seatUses.get(seatId) || 0;
    return used < definition.maxUses;
  }
}

/**
 * 使用限次能力
 * @param seatId 玩家ID
 * @param abilityId 能力ID
 * @param customDefinition 可选的自定义定义
 * @returns 是否成功使用
 */
export function useLimitedAbility(
  seatId: number,
  abilityId: string,
  customDefinition?: LimitedAbilityDefinition
): boolean {
  const definition = customDefinition || definitions.get(abilityId);
  if (!definition) {
    // 没有定义，默认允许使用
    return true;
  }

  if (!canUseLimitedAbility(seatId, abilityId, customDefinition)) {
    return false;
  }

  if (definition.global) {
    const used = globalUses.get(abilityId) || 0;
    globalUses.set(abilityId, used + 1);
  } else {
    let seatUses = instanceUses.get(abilityId);
    if (!seatUses) {
      seatUses = new Map<number, number>();
      instanceUses.set(abilityId, seatUses);
    }
    const used = seatUses.get(seatId) || 0;
    seatUses.set(seatId, used + 1);
  }

  return true;
}

/**
 * 获取已使用次数
 */
export function getLimitedAbilityUsedCount(
  seatId: number,
  abilityId: string
): number {
  const definition = definitions.get(abilityId);
  if (!definition) return 0;

  if (definition.global) {
    return globalUses.get(abilityId) || 0;
  } else {
    const seatUses = instanceUses.get(abilityId);
    return seatUses?.get(seatId) || 0;
  }
}

/**
 * 重置能力使用次数
 * @param seatId 玩家ID（如果为null，重置所有玩家的该能力）
 * @param abilityId 能力ID
 */
export function resetLimitedAbilityUses(seatId?: number, abilityId?: string) {
  if (abilityId) {
    if (seatId !== undefined) {
      // 重置特定玩家的特定能力
      const seatUses = instanceUses.get(abilityId);
      if (seatUses) {
        seatUses.delete(seatId);
      }
    } else {
      // 重置所有玩家的该能力
      globalUses.delete(abilityId);
      instanceUses.delete(abilityId);
    }
  } else {
    // 重置所有能力
    globalUses.clear();
    instanceUses.clear();
  }
}

/**
 * 角色变化时重置相关能力使用次数
 * @param seatId 玩家ID
 * @param oldRoleId 旧角色ID
 * @param newRoleId 新角色ID
 */
export function onLimitedAbilityRoleChanged(
  seatId: number,
  _oldRoleId?: string,
  _newRoleId?: string
) {
  // 重置所有需要重置的能力
  for (const [abilityId, definition] of definitions) {
    if (definition.resetOnRoleChange !== false) {
      const seatUses = instanceUses.get(abilityId);
      if (seatUses) {
        seatUses.delete(seatId);
      }
    }
  }
}

// ======================================================================
//  限次能力使用便利函数
// ======================================================================

/**
 * 检查限次能力是否可用（便利函数）
 */
export const checkLimitedAbilityUsage = canUseLimitedAbility;

/**
 * 使用限次能力（便利函数）
 */
export const useLimitedAbilityFunc = useLimitedAbility;

/**
 * 获取限次能力已使用次数（便利函数）
 */
export const getLimitedAbilityUsedCountFunc = getLimitedAbilityUsedCount;

/**
 * 重置限次能力使用次数（便利函数）
 */
export const resetLimitedAbilityFunc = resetLimitedAbilityUses;

/**
 * 角色变化时处理限次能力重置（便利函数）
 */
export const handleRoleChangeForLimitedAbilities = onLimitedAbilityRoleChanged;
