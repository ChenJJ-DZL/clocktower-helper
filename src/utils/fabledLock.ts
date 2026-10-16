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

/**
 * ⭐ 传奇角色的「虚拟座位号」（用户裁定 2026-10-16）：**77**。
 *
 * 传奇角色不占玩家座位（见本文件顶部说明），但在处决记录 / 死亡标记 /
 * 日志等需要数字 id 的场合，必须有一个**永不与任何人冲突**的值。
 * 取值口径（三套命名空间，永不互撞）：
 *   · 玩家座位      = `0 ~ 14`（`seats.id`）
 *   · 旅行者        = `-1 ~ -4`（`-(index+1)`，见 utils/travelerHooks.ts）
 *   · 传奇角色      = `77`（本常量）
 * ⚠️ 禁用 0 —— 0 已是 1 号玩家的座位 id，用 0 会立刻打架。
 */
export const FABLED_SEAT_ID = 77;

/** 旅行者数量上限：一局最多 4 名 */
export const TRAVELER_MAX = 4;

/**
 * ⭐ 「说书人」作为**提名者**的虚拟 id：`-100`。
 *
 * 用途（主教 Bishop）：官方「**只有说书人可以发起提名。** 每个白天说书人至少要
 *   提名一名你对立阵营的玩家。」⇒ 主教在场时，`executeNomination` 的
 *   `sourceId` 不再是座位 id，而是本常量。
 *
 * 取值口径（**第四个**命名空间，仍与前三者不冲突）：
 *   · 玩家座位   `0 ~ 14`
 *   · 旅行者插槽 `-1 ~ -4`
 *   · 传奇角色   `77`
 *   · 说书人提名者 `-100`
 * ⚠️ 不得改用 `-1 ~ -4`（那是旅行者插槽）或 `0`（1 号玩家座位）。
 *   新增虚拟 id 前请先用 `checkSeatIdNamespace()` 过一遍冲突检查。
 */
export const STORYTELLER_NOMINATOR_ID = -100;

/** 该 id 是否为「说书人提名者」虚拟 id */
export function isStorytellerNominatorId(id: unknown): boolean {
  return id === STORYTELLER_NOMINATOR_ID;
}

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

// ══════════════════════════════════════════════════════════════════════
// 座位号命名空间（玩家 / 旅行者 / 传奇角色 三层互不干扰）
// ══════════════════════════════════════════════════════════════════════

// ⚠️ 本文件不得出现含中文的字符串字面量（不变量 5：角色名一律走 roleId 解析）。
//   因此"77号位(传奇)"这类**展示标签由界面层自行组装**，本文件只提供数字与谓词。

/** 是否为传奇角色虚拟座位号 */
export function isFabledSeatId(id: unknown): boolean {
  return id === FABLED_SEAT_ID;
}

/** 一组候选座位 id 与三套命名空间的冲突报告 */
export interface SeatIdNamespaceReport {
  ok: boolean;
  /** 与玩家座位 id 撞车的项 */
  clashWithPlayers: number[];
  /** 与旅行者插槽 id 撞车的项 */
  clashWithTravelers: number[];
  /** 与传奇虚拟座位号撞车的项 */
  clashWithFabled: number[];
}

/**
 * 校验给定 id 集合是否落在任一既有命名空间里（纯函数，可单测）。
 *
 * ⭐ 存在的意义：三套 id 空间是**口头约定**（玩家 `0~14` / 旅行者 `-1~-4` /
 *   传奇 `77`），任何新增的"虚拟座位号"都必须先过这道检查，
 *   否则会出现「某个新功能占用了 3，把 4 号玩家顶掉」这类静默冲突。
 *
 * @param ids             待校验的 id 集合
 * @param playerSeatIds   本局玩家座位 id（通常 `seats.map(s => s.id)`）
 * @param travelerSlotIds 本局旅行者插槽 id（通常 `listAliveTravelerSlots(...).map(t => t.slotId)`）
 */
export function checkSeatIdNamespace(
  ids: readonly number[],
  playerSeatIds: readonly number[] = [],
  travelerSlotIds: readonly number[] = []
): SeatIdNamespaceReport {
  const players = new Set(playerSeatIds);
  const travelers = new Set(travelerSlotIds);
  const clashWithPlayers: number[] = [];
  const clashWithTravelers: number[] = [];
  const clashWithFabled: number[] = [];
  for (const id of ids) {
    if (players.has(id)) clashWithPlayers.push(id);
    if (travelers.has(id)) clashWithTravelers.push(id);
    if (isFabledSeatId(id)) clashWithFabled.push(id);
  }
  return {
    ok:
      clashWithPlayers.length === 0 &&
      clashWithTravelers.length === 0 &&
      clashWithFabled.length === 0,
    clashWithPlayers,
    clashWithTravelers,
    clashWithFabled,
  };
}
