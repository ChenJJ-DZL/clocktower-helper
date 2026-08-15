/**
 * L3.5 不变式测试 - 引擎配置构建
 *
 * 复刻 useNightEngine.ts 中 generateNightOrderFromParser 的构建逻辑，
 * 供仿真器独立使用（不依赖 React hooks）。
 *
 * 数据源：
 * - unifiedRoleDefinition.getAllAbilities() — 能力注册表（含优先级/触发时机）
 * - nightOrderParser — 官方夜晚顺序 JSON（json/夜晚行动顺序.json）
 * - getRawAbilityMap — 原始 IRoleAbility 映射（abilityId → 能力）
 */
import { AbilityTriggerTiming } from "../../roles/core/roleAbility.types";
import {
  getRawAbilityMap,
  initializeAbilityRegistry,
} from "../../roles/new_engine/abilityRegistry";
import { unifiedRoleDefinition } from "../../roles/unifiedRoleDefinition";
import type { NightOrderEntry } from "../dynamicQueueGenerator";
import { nightOrderParser } from "../nightOrderParser";

/** 确保能力注册表已初始化（幂等） */
let _initialized = false;
export function ensureAbilityRegistry(): void {
  if (_initialized) return;
  initializeAbilityRegistry();
  _initialized = true;
}

/**
 * 从能力注册表 + 官方夜晚顺序构建全量夜晚顺序表（与 useNightEngine 一致）
 */
export function buildFullNightOrder(): NightOrderEntry[] {
  ensureAbilityRegistry();
  const allAbilities = unifiedRoleDefinition.getAllAbilities();
  const firstNightOrder = nightOrderParser.getFirstNightOrder();
  const otherNightOrder = nightOrderParser.getOtherNightOrder();

  const entries: NightOrderEntry[] = [];

  for (const ability of allAbilities as any[]) {
    const fn = ability.firstNightPriority;
    const on = ability.otherNightPriority;
    const hasFn = fn !== null && fn !== undefined && fn > 0;
    const hasOn = on !== null && on !== undefined && on > 0;

    if (!hasFn && !hasOn) continue; // 无夜晚行动（含被动能力）

    const firstNightItem = firstNightOrder.find(
      (item) => item.roleId === ability.roleId
    );
    const otherNightItem = otherNightOrder.find(
      (item) => item.roleId === ability.roleId
    );

    entries.push({
      roleId: ability.roleId,
      roleName:
        firstNightItem?.roleName || otherNightItem?.roleName || ability.roleId,
      abilityId: ability.abilityId,
      firstNightPriority: hasFn ? fn! : 0,
      otherNightPriority: hasOn ? on! : 0,
      firstNightOnly: hasFn && !hasOn,
      otherNightOnly: (ability as any).otherNightOnly ?? (hasOn && !hasFn),
      wakeMessage: ability.wakePromptId || `${ability.roleId}请行动`,
      // 间谍死后仍可唤醒查看魔典（规则明确允许）
      deadActorWakes: ability.roleId === "spy",
      // 送葬者：仅当日有玩家死于处决时才入队
      requiresExecutedToday: ability.roleId === "undertaker",
      // 死亡触发型角色（守鸦人 ON_DEATH）：仅当晚死亡时入队
      deathTriggered:
        (ability.triggerTiming as string[])?.includes(
          AbilityTriggerTiming.ON_DEATH
        ) ?? false,
    });
  }

  entries.sort((a, b) => {
    const pa =
      a.firstNightPriority > 0 ? a.firstNightPriority : a.otherNightPriority;
    const pb =
      b.firstNightPriority > 0 ? b.firstNightPriority : b.otherNightPriority;
    return pa - pb;
  });
  return entries;
}

/** 能力映射表（abilityId → IRoleAbility） */
export function buildAbilityMap() {
  ensureAbilityRegistry();
  return getRawAbilityMap();
}
