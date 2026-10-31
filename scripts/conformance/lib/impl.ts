/**
 * 项目实现清单：把「代码实际实现了什么」变成可枚举数据
 * ----------------------------------------------------------------------
 * 数据来源（全部是已落盘事实）：
 *   · 角色表/剧本表 ← `app/data.ts`（游戏内权威角色清单 + 9 个内置剧本）
 *   · 能力注册表   ← `src/roles/new_engine/abilityRegistry`（新引擎 219 个能力）
 *
 * 注意：`getAbilityForRole` 使用 `startsWith` 前缀匹配，遇到
 * `professor` vs `professor_female` 这类变体角色会误配；本清单改为从
 * `getRawAbilityMap()` 的 value.roleId **精确**建立索引，避免审计被误导。
 */
import { roles, scripts } from "../../../app/data";
import {
  getRawAbilityMap,
  initializeAbilityRegistry,
} from "../../../src/roles/new_engine/abilityRegistry";
import type { ImplInventory, ImplRole, ImplRoleType } from "./types";

interface RawAbility {
  roleId?: string;
  abilityId?: string;
  triggerTiming?: unknown[];
  firstNightPriority?: number | null;
  otherNightPriority?: number | null;
  targetConfig?: {
    min?: number;
    max?: number;
    allowSelf?: boolean;
    allowDead?: boolean;
  } | null;
}

function asStringArray(value: unknown[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v));
}

/** 精确建立 roleId → 能力 的索引（一个角色可能注册多个能力，取第一个） */
export function buildAbilityIndex(): Map<string, RawAbility> {
  initializeAbilityRegistry();
  const map = getRawAbilityMap() as Record<string, RawAbility>;
  const byRole = new Map<string, RawAbility>();
  const unknownRoleKeys: string[] = [];
  for (const [key, ability] of Object.entries(map)) {
    const roleId = ability?.roleId ?? "";
    if (!roleId) {
      unknownRoleKeys.push(key);
      continue;
    }
    if (!byRole.has(roleId)) byRole.set(roleId, ability);
  }
  if (unknownRoleKeys.length > 0) {
    // 注册表里没有 roleId 的键无法映射到角色，审计时应暴露而不是静默忽略
    console.warn(
      `[conformance] ${unknownRoleKeys.length} 个能力注册项缺少 roleId: ${unknownRoleKeys
        .slice(0, 5)
        .join(", ")}`
    );
  }
  return byRole;
}

/** 构建实现清单（默认读取仓库当前状态） */
export function buildImplInventory(): ImplInventory {
  const abilityByRole = buildAbilityIndex();
  const appRoles = roles as unknown as Array<{
    id: string;
    name: string;
    type: string;
    script?: string | string[];
  }>;
  const appScripts = scripts as unknown as Array<{
    id: string;
    name: string;
    roleIds: string[];
  }>;

  const builtInRoleIds = new Set<string>();
  for (const script of appScripts) {
    for (const roleId of script.roleIds ?? []) builtInRoleIds.add(roleId);
  }

  const implRoles: ImplRole[] = appRoles.map((role) => {
    const ability = abilityByRole.get(role.id) ?? null;
    const scriptsOfRole = Array.isArray(role.script)
      ? role.script
      : role.script
        ? [role.script]
        : [];
    return {
      roleId: role.id,
      nameCn: role.name,
      type: role.type as ImplRoleType,
      inBuiltInScript: builtInRoleIds.has(role.id),
      scripts: scriptsOfRole,
      ability: ability
        ? {
            abilityId: ability.abilityId ?? "",
            triggerTiming: asStringArray(ability.triggerTiming),
            firstNightPriority: ability.firstNightPriority ?? null,
            otherNightPriority: ability.otherNightPriority ?? null,
            targetMin: ability.targetConfig?.min ?? null,
            targetMax: ability.targetConfig?.max ?? null,
            allowSelf: ability.targetConfig?.allowSelf ?? null,
            allowDead: ability.targetConfig?.allowDead ?? null,
          }
        : null,
    };
  });

  return {
    roles: implRoles,
    builtInRoleIds,
    scriptNames: appScripts.map((s) => s.name),
    scriptRoleIds: Object.fromEntries(
      appScripts.map((script) => [script.name, script.roleIds ?? []])
    ),
    stats: {
      appRoles: implRoles.length,
      builtInRoles: builtInRoleIds.size,
      rolesWithAbility: implRoles.filter((r) => r.ability !== null).length,
    },
  };
}
