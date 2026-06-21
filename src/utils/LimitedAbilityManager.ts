// ======================================================================
//  限次能力统一管理器（简化版）
// ======================================================================
//
// 变更说明：
//   v2 — 移除6个冗余别名函数，抽取公共定义查找逻辑，简化角色变化重置逻辑
//

/**
 * 限次能力定义接口
 */
export interface LimitedAbilityDefinition {
  abilityId: string;
  maxUses: number;
  global: boolean;
  consumeWhenDrunkOrPoisoned?: boolean;
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
  { abilityId: "philosopher_use",           maxUses: 1, global: false, resetOnRoleChange: true },
  { abilityId: "artist_paint",              maxUses: 1, global: false, resetOnRoleChange: true },
  { abilityId: "seamstress_ability",        maxUses: 1, global: true,  resetOnRoleChange: false },
  { abilityId: "professor_resurrect",       maxUses: 1, global: false, resetOnRoleChange: true },
  { abilityId: "courtier_drunk",            maxUses: 1, global: false, consumeWhenDrunkOrPoisoned: true,  resetOnRoleChange: true },
  { abilityId: "assassin_kill",             maxUses: 1, global: false, consumeWhenDrunkOrPoisoned: true,  resetOnRoleChange: true },
  { abilityId: "shabaloth_double_kill",     maxUses: 1, global: true,  resetOnRoleChange: false },
];

/** 抽取公共定义查找逻辑 */
function resolveDef(abilityId: string, custom?: LimitedAbilityDefinition) {
  return custom ?? definitions.get(abilityId);
}

/**
 * 初始化管理器，加载预定义能力
 */
export function initializeLimitedAbilityManager() {
  predefinedDefinitions.forEach((def) => definitions.set(def.abilityId, def));
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
 */
export function canUseLimitedAbility(
  seatId: number,
  abilityId: string,
  customDefinition?: LimitedAbilityDefinition
): boolean {
  const def = resolveDef(abilityId, customDefinition);
  if (!def) return true; // 无定义则默认允许（向后兼容）

  if (def.global) return (globalUses.get(abilityId) ?? 0) < def.maxUses;
  return (instanceUses.get(abilityId)?.get(seatId) ?? 0) < def.maxUses;
}

/**
 * 使用限次能力
 */
export function consumeLimitedAbility(
  seatId: number,
  abilityId: string,
  customDefinition?: LimitedAbilityDefinition
): boolean {
  const def = resolveDef(abilityId, customDefinition);
  if (!def) return true;
  if (!canUseLimitedAbility(seatId, abilityId, customDefinition)) return false;

  if (def.global) {
    globalUses.set(abilityId, (globalUses.get(abilityId) ?? 0) + 1);
  } else {
    let seatUses = instanceUses.get(abilityId);
    if (!seatUses) {
      seatUses = new Map();
      instanceUses.set(abilityId, seatUses);
    }
    seatUses.set(seatId, (seatUses.get(seatId) ?? 0) + 1);
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
  const def = resolveDef(abilityId);
  if (!def) return 0;
  if (def.global) return globalUses.get(abilityId) ?? 0;
  return instanceUses.get(abilityId)?.get(seatId) ?? 0;
}

/**
 * 重置能力使用次数
 */
export function resetLimitedAbilityUses(seatId?: number, abilityId?: string) {
  if (abilityId) {
    if (seatId !== undefined) {
      instanceUses.get(abilityId)?.delete(seatId);
    } else {
      globalUses.delete(abilityId);
      instanceUses.delete(abilityId);
    }
  } else {
    globalUses.clear();
    instanceUses.clear();
  }
}

/**
 * 角色变化时重置相关能力使用次数
 */
export function onLimitedAbilityRoleChanged(seatId: number) {
  for (const [abilityId, def] of definitions) {
    if (def.resetOnRoleChange !== false) {
      instanceUses.get(abilityId)?.delete(seatId);
    }
  }
}
