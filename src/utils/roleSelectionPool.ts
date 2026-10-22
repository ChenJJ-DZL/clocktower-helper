import { isTownsfolkOrOutsiderRole } from "./seatAlignment";

/**
 * 🎯 「需要选角色」的角色，可选角色池
 * ----------------------------------------------------------------------------
 * 官方口径（`src/data/officialRoleDocs.json` 逐字）：
 * · 洗脑师【角色能力】：「每个夜晚，你要选择一名玩家和**一个善良角色**。」
 *   【角色简介】：「洗脑师会选择让一名玩家"疯狂"地证明自己是**某个镇民或外来者角色**。」
 * · 哲学家【角色能力】：「…你可以选择**一个善良角色**：你获得该角色的能力。」
 * · 麻脸巫婆【角色能力】：「…选择一个角色，如果该角色不在场，他变成该角色。」
 *   —— 没有「善良」限定 ⇒ 可选任意角色。
 * · 奥乔 / 酿酒师：本仓按「任意角色」处理（官方未限定善良）。
 *
 * 🔴 2026-10-22 实测缺陷（文案对账批 2）：
 *   `useNightActionHandler` 里只给 `philosopher` 过滤了善良角色，
 *   洗脑师拿到的是**全部角色**（含爪牙 / 恶魔）⇒ 说书人可以把「小恶魔」当成疯狂角色。
 *   官方明确只能是镇民或外来者（角色简介原话），这是**规则方向**错误，不是文案问题。
 *
 * 抽成纯函数的原因：过滤逻辑埋在 1200 行的 hook 里没法单测，改一行就可能悄悄回退。
 */
export const ROLE_SELECTION_GOOD_ONLY = [
  "philosopher",
  "cerenovus",
] as const;

const GOOD_ONLY = new Set<string>(ROLE_SELECTION_GOOD_ONLY);

export function isGoodOnlyRoleSelection(roleId: string | null | undefined): boolean {
  return !!roleId && GOOD_ONLY.has(roleId);
}

/**
 * @param roleId   正在行动的角色 id（洗脑师 / 哲学家 / 麻脸巫婆 …）
 * @param allRoles 当前剧本的全部角色定义
 * @returns 该角色可选的候选角色表
 */
export function availableRolesForRoleSelection<T extends { type?: string | null }>(
  roleId: string | null | undefined,
  allRoles: T[] | null | undefined
): T[] {
  const list = Array.isArray(allRoles) ? allRoles : [];
  if (!isGoodOnlyRoleSelection(roleId)) return list;
  return list.filter((r) => isTownsfolkOrOutsiderRole(r as any));
}
