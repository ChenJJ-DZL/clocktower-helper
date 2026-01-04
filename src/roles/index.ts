import { RoleDefinition } from "../types/roleDefinition";
import { monk } from "./townsfolk/monk";
import { washerwoman } from "./townsfolk/washerwoman";
import { librarian } from "./townsfolk/librarian";
import { investigator } from "./townsfolk/investigator";
import { chef } from "./townsfolk/chef";
import { poisoner } from "./minion/poisoner";

/**
 * 角色注册表
 * 使用 Map 结构，以角色 ID 为键，方便快速查找
 */
export const roleRegistry: Map<string, RoleDefinition> = new Map([
  [monk.id, monk],
  [washerwoman.id, washerwoman],
  [librarian.id, librarian],
  [investigator.id, investigator],
  [chef.id, chef],
  [poisoner.id, poisoner],
]);

/**
 * 根据角色 ID 获取角色定义
 * @param roleId 角色 ID
 * @returns 角色定义，如果不存在则返回 undefined
 */
export function getRoleDefinition(roleId: string): RoleDefinition | undefined {
  return roleRegistry.get(roleId);
}

/**
 * 获取所有已注册的角色定义
 * @returns 所有角色定义的数组
 */
export function getAllRoleDefinitions(): RoleDefinition[] {
  return Array.from(roleRegistry.values());
}

/**
 * 检查角色是否已注册
 * @param roleId 角色 ID
 * @returns 是否已注册
 */
export function isRoleRegistered(roleId: string): boolean {
  return roleRegistry.has(roleId);
}

// 导出所有角色定义（方便按类型导入）
export { monk } from "./townsfolk/monk";
export { washerwoman } from "./townsfolk/washerwoman";
export { librarian } from "./townsfolk/librarian";
export { investigator } from "./townsfolk/investigator";
export { chef } from "./townsfolk/chef";
export { poisoner } from "./minion/poisoner";

