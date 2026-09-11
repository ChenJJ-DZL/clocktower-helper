import type { Seat } from "../../app/data";

/**
 * 🌾 农夫遇害传承（Farmer）—— 身份替换的**唯一事实来源**。
 *
 * 官方依据（仓库自带数据）：
 * - `src/data/nightOrder.json`：「如果农夫死于夜晚，唤醒一名存活的善良玩家告知他角色变化。」
 * - `src/data/generatedRoleWakeTemplates.ts`：「当你在夜晚死亡时，一名存活的善良玩家会变成农夫」
 * - 引擎侧官方范例（`expansion_roles_examples.test.ts`）：善良玩家变成新农夫；邪恶玩家不能变成农夫。
 *
 * 为什么单独抽出来：可被单测覆盖，避免以后又有别处各写一套"只加 statusDetails 不改 role"的半吊子实现。
 */

/** 新农夫身份变化后，展示给该玩家的结果页文案（走既有 INFO_RESULT 机制） */
export const FARMER_SUCCESSOR_RESULT_TEXT = "你的身份变为【农夫】";

export interface FarmerSuccessionSeatLike {
  id: number;
  role?: {
    id?: string;
    name?: string;
    type?: string;
    [k: string]: unknown;
  } | null;
  roleId?: string;
  roleName?: string;
  roleType?: string;
  statusDetails?: string[];
  [k: string]: unknown;
}

export interface FarmerGuardSeatLike extends FarmerSuccessionSeatLike {
  isDrunk?: boolean;
  isPoisoned?: boolean;
}

/**
 * 判定本夜是否需要弹出「农夫遇害传承」面板，返回死亡农夫所在座位 id（不需要则 undefined）。
 *
 * 官方边界：**中毒/醉酒的农夫死亡不触发传承**（能力失效）。这里同时排除 legacy 的
 * `isDrunk` / `isPoisoned` 标记与外部注入的状态判定（`isPoisonedByAura`，对应
 * `computeIsPoisoned` 这类需要考虑光环/相邻效果的判定）。
 */
export function findFarmerSuccessionTrigger<T extends FarmerGuardSeatLike>(
  prevSeats: readonly T[],
  newlyDeadIds: readonly number[],
  isPoisonedByAura?: (seat: T, all: readonly T[]) => boolean
): number | undefined {
  return newlyDeadIds.find((id) => {
    const seat = prevSeats.find((s) => s.id === id);
    if (!seat) return false;
    if (seat.role?.id !== "farmer") return false;
    if (seat.isDrunk || seat.isPoisoned) return false;
    if (isPoisonedByAura?.(seat, prevSeats)) return false;
    return true;
  });
}

/**
 * 把 `targetId` 座位**整体替换**为新农夫：
 * - role 对象替换（id/name/type 全变，type 为 townsfolk）→ 技能随之按农夫解析；
 * - 同步写 roleId / roleName / roleType（legacy 字段，界面与旧逻辑读取）；
 * - 追加 statusDetails「成为新农夫」（去重，避免重复触发时叠加）。
 *
 * 纯函数：不改动入参，返回新数组；未命中目标时返回原数组与 changed=false。
 */
export function applyFarmerSuccession<T extends FarmerSuccessionSeatLike>(
  seats: readonly T[],
  targetId: number
): { seats: T[]; changed: boolean } {
  let changed = false;
  const next = seats.map((seat) => {
    if (seat.id !== targetId) return seat;
    changed = true;
    const details = Array.isArray(seat.statusDetails) ? seat.statusDetails : [];
    const nextDetails = details.includes("成为新农夫")
      ? details
      : [...details, "成为新农夫"];
    return {
      ...seat,
      role: {
        ...(seat.role ?? {}),
        id: "farmer",
        name: "农夫",
        type: "townsfolk",
      },
      roleId: "farmer",
      roleName: "农夫",
      roleType: "townsfolk",
      statusDetails: nextDetails,
    } as T;
  });
  return { seats: changed ? next : ([...seats] as T[]), changed };
}
