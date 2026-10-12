/**
 * fabledLock - 传奇角色（Fabled）编辑锁 + 传奇/旅行者数量上限（纯函数层）
 * ======================================================================
 * 裁决口径：
 *   · 可编辑 activeFabled ⟺ gamePhase ∈ { "setup", "scriptSelection" }
 *   · 只读（锁定）        ⟺ 其余 7 个阶段（check / firstNight / day / dusk /
 *     night / dawnReport / gameOver）
 *   · 「重新开一局」= gamePhase 回到 "scriptSelection" / "setup"（解锁）
 *   · 不新增锁定状态字段、不新增枚举、不新增独立状态机 —— 一切以既有
 *     GamePhase（app/data.ts）判定，UI 与状态层都只调本函数。
 *
 * 数量上限（官方设计）：
 *   · 传奇角色上限 1 个：不占玩家座位，作为全局规则生效，不计入邪恶阵营。
 *     选第 2 个 = 替换第 1 个（单选语义，不是拒绝）。
 *   · 旅行者上限 4 名：不占玩家的 15 个座位，与最多 15 名玩家共存。
 *     超出上限的新增直接忽略。
 */
import type { GamePhase, Role } from "../../app/data";

/** 传奇角色数量上限：一局最多 1 个 */
export const FABLED_MAX = 1;

/** 旅行者数量上限：一局最多 4 名 */
export const TRAVELER_MAX = 4;

/**
 * 传奇角色是否可编辑（锁定判定的唯一入口）
 * - setup（选择角色/落座）与 scriptSelection（新开一局）可编辑
 * - check（落座确认）及其之后所有阶段锁定
 */
export function canEditFabled(gamePhase: GamePhase): boolean {
  return gamePhase === "setup" || gamePhase === "scriptSelection";
}

/**
 * 传奇单选（上限 1）：role 为 null 表示清除；
 * 选第 2 个时替换第 1 个，列表永不出现第 2 个。
 */
export function withFabled(_list: Role[], role: Role | null): Role[] {
  return role === null ? [] : [role];
}

/**
 * 位置化写入第 index 个旅行者座位（定长列表，role 为 null 表示清空该座位）：
 * 越界 index 原样返回；始终返回新数组（纯函数，不原地修改）。
 */
export function setTravelerAt(
  list: (Role | null)[],
  index: number,
  role: Role | null
): (Role | null)[] {
  if (index < 0 || index >= list.length) return list;
  const next = [...list];
  next[index] = role;
  return next;
}

/**
 * 按 roleId 移除一个角色（一切逻辑按 roleId 解析，不硬编码角色名）
 */
export function withoutRole(list: Role[], roleId: string): Role[] {
  return list.filter((r) => r.id !== roleId);
}
