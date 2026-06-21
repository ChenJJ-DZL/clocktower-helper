"use client";

/**
 * 夜晚队列归一化工具
 *
 * 统一了旧版 wakeQueueIds（number[]）和新版 NightActionNode[] 的队列管理。
 *
 * 职责：
 *   1. 夜晚中有玩家死亡后，从等待队列中剔除死者并修正当前索引
 *   2. 提供 NightActionNode[] 和 number[] 之间的转换
 *
 * 使用方式：
 *   - 新代码：normalizeNightActionQueue(queue, currentIndex, seats, deadThisNight)
 *   - 旧代码（过渡期）：normalizeWakeQueueForDeaths({ wakeQueueIds, ... })
 *
 * 迁移方向：所有新代码应使用 NightActionNode[] 版本。
 */

import type { Seat } from "../../app/data";
import type { NightActionNode } from "./nightStateMachine";

// ─── NightActionNode 版本的归一化（新 API） ─────────────

export interface NormalizeNightQueueInput {
  /** 当前夜晚行动节点队列 */
  queue: NightActionNode[];
  /** 当前队列索引 */
  currentIndex: number;
  /** 完整座位列表 */
  seats: Seat[];
  /** 今晚死亡的玩家 ID 列表 */
  deadThisNight: number[];
}

export interface NormalizeNightQueueResult {
  /** 归一化后的队列 */
  queue: NightActionNode[];
  /** 调整后的索引 */
  currentIndex: number;
  /** 被移除的玩家 ID 列表 */
  removedIds: number[];
}

/**
 * 在夜晚中有玩家死亡后，归一化 NightActionNode[] 队列：
 *   - 剔除不应再叫醒的死者
 *   - 修正 currentIndex（防止跳过存活玩家）
 *   - 特殊规则：守鸦人当晚死亡仍可叫醒
 */
export function normalizeNightActionQueue(
  input: NormalizeNightQueueInput
): NormalizeNightQueueResult {
  const { queue, currentIndex, seats, deadThisNight } = input;

  const deadSeatIds = new Set(deadThisNight);
  const shouldRemoveFromQueue = (node: NightActionNode) => {
    const seat = seats.find((s) => s.id === node.seatId);
    if (!seat) return true;
    // Ravenkeeper: 当晚死亡仍要叫醒
    if (seat.role?.id === "ravenkeeper" && deadSeatIds.has(seat.id)) {
      return false;
    }
    // hasAbilityEvenDead 的玩家死亡后仍可叫醒
    if (seat.isDead && !seat.hasAbilityEvenDead) return true;
    return false;
  };

  const removeIds = new Set(
    queue.filter(shouldRemoveFromQueue).map((n) => n.seatId)
  );
  if (removeIds.size === 0) {
    return { queue, currentIndex, removedIds: [] };
  }

  const removedBefore = queue
    .slice(0, Math.max(0, currentIndex))
    .filter((n) => removeIds.has(n.seatId)).length;

  const nextQueue = queue.filter((n) => !removeIds.has(n.seatId));
  const nextIndex = Math.max(0, currentIndex - removedBefore);

  return {
    queue: nextQueue,
    currentIndex: nextIndex,
    removedIds: Array.from(removeIds),
  };
}

// ─── 旧版 number[] 归一化（向后兼容包装器） ───────────

export interface NormalizeWakeQueueInput {
  wakeQueueIds: number[];
  currentWakeIndex: number;
  seats: Seat[];
  deadThisNight: number[];
  getSeatRoleId: (seat?: Seat | null) => string | null;
}

export interface NormalizeWakeQueueResult {
  wakeQueueIds: number[];
  currentWakeIndex: number;
  removedIds: number[];
}

/**
 * @deprecated 使用 normalizeNightActionQueue 替代
 * 旧版：将 wakeQueueIds: number[] 转为 NightActionNode[] 后调用新版，
 * 再将结果转回 number[]。
 */
export function normalizeWakeQueueForDeaths(
  input: NormalizeWakeQueueInput
): NormalizeWakeQueueResult {
  const { wakeQueueIds, currentWakeIndex, seats, deadThisNight } = input;

  // 将 number[] 转为 NightActionNode[]
  const nodes: NightActionNode[] = wakeQueueIds.map((seatId) => {
    const seat = seats.find((s) => s.id === seatId);
    return {
      seatId,
      roleId: seat?.role?.id ?? "",
      roleName: seat?.role?.name ?? "",
      priority: 0,
      isFirstNightOnly: false,
      abilityId: "",
      wakeMessage: "",
      wakePriority: 0,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    };
  });

  // 调用新版归一化
  const result = normalizeNightActionQueue({
    queue: nodes,
    currentIndex: currentWakeIndex,
    seats,
    deadThisNight,
  });

  return {
    wakeQueueIds: result.queue.map((n) => n.seatId),
    currentWakeIndex: result.currentIndex,
    removedIds: result.removedIds,
  };
}

// ─── 转换工具 ─────────────────────────────────────────

/**
 * 将 NightActionNode[] 转为数量 ID 列表
 */
export function nightActionNodesToIds(nodes: NightActionNode[]): number[] {
  return nodes.map((n) => n.seatId);
}

/**
 * 将数量 ID 列表转为 NightActionNode[]（需提供 seats 查找角色信息）
 */
export function idsToNightActionNodes(
  ids: number[],
  seats: Seat[]
): NightActionNode[] {
  return ids.map((seatId) => {
    const seat = seats.find((s) => s.id === seatId);
    return {
      seatId,
      roleId: seat?.role?.id ?? "",
      roleName: seat?.role?.name ?? "",
      priority: 0,
      isFirstNightOnly: false,
      abilityId: "",
      wakeMessage: "",
      wakePriority: 0,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    };
  });
}
