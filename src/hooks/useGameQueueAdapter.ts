"use client";

/**
 * 游戏队列适配器
 * 统一了旧版 wakeQueueIds（number[]）与新 nightActionQueue（Seat[] / NightActionNode[]）
 *
 * 所有新代码应优先使用 NightActionNode[] 版本。
 * wakeQueueIds 作为推导字段保留向后兼容。
 */

import type { Seat } from "../../app/data";
import type { NightActionNode } from "../utils/nightStateMachine";
import {
  nightActionNodesToIds,
  idsToNightActionNodes,
} from "../utils/wakeQueue";

export interface QueueAdapterState {
  // 旧系统接口（向后兼容）
  wakeQueueIds: number[];
  currentWakeIndex: number;

  // 新系统接口
  nightActionQueue: Seat[];
  currentQueueIndex: number;

  // NightActionNode 接口
  nightActionNodes: NightActionNode[];

  // 队列状态
  isQueueEmpty: boolean;
  isAtEndOfQueue: boolean;
  currentSeatId: number | undefined;
}

/**
 * 创建队列适配器状态
 * 同时生成 wakeQueueIds（向后兼容）、nightActionNodes（新 API）
 */
export function createQueueAdapter(
  nightActionQueue: Seat[],
  inputIndex: number
): QueueAdapterState {
  const wakeQueueIds = nightActionQueue.map((seat) => seat.id);
  const nightActionNodes: NightActionNode[] = nightActionQueue.map((seat) => ({
    seatId: seat.id,
    roleId: seat.role?.id ?? "",
    roleName: seat.role?.name ?? "",
    priority: 0,
    isFirstNightOnly: false,
    abilityId: "",
    wakeMessage: "",
    firstNightPriority: null,
    otherNightPriority: null,
    targetIds: [],
    processed: false,
    success: false,
    meta: {},
  }));

  const currentQueueIndex = Math.max(
    0,
    Math.min(inputIndex, nightActionQueue.length - 1)
  );
  const currentQueueItem = nightActionQueue[currentQueueIndex];

  return {
    // 旧系统
    wakeQueueIds,
    currentWakeIndex: currentQueueIndex,

    // 新系统
    nightActionQueue,
    currentQueueIndex,

    // NightActionNode
    nightActionNodes,

    // 状态
    isQueueEmpty: nightActionQueue.length === 0,
    isAtEndOfQueue: currentQueueIndex >= nightActionQueue.length - 1,
    currentSeatId: currentQueueItem?.id,
  };
}

/**
 * 从 NightActionNode[] 创建适配器状态
 */
export function createQueueAdapterFromNodes(
  nodes: NightActionNode[],
  inputIndex: number,
  seats: Seat[]
): QueueAdapterState {
  const wakeQueueIds = nightActionNodesToIds(nodes);
  const nightActionQueue = wakeQueueIds
    .map((id) => seats.find((s) => s.id === id))
    .filter((seat): seat is Seat => seat !== undefined);

  const currentQueueIndex = Math.max(
    0,
    Math.min(inputIndex, nodes.length - 1)
  );
  const currentNode = nodes[currentQueueIndex];
  const currentSeatId = currentNode?.seatId;

  return {
    wakeQueueIds,
    currentWakeIndex: currentQueueIndex,
    nightActionQueue,
    currentQueueIndex,
    nightActionNodes: nodes,
    isQueueEmpty: nodes.length === 0,
    isAtEndOfQueue: currentQueueIndex >= nodes.length - 1,
    currentSeatId,
  };
}

/**
 * 将旧系统的 wakeQueueIds 转换为 Seat[]
 */
export function convertWakeQueueIdsToSeats(
  wakeQueueIds: number[],
  seats: Seat[]
): Seat[] {
  return wakeQueueIds
    .map((id) => seats.find((s) => s.id === id))
    .filter((seat): seat is Seat => seat !== undefined);
}

/**
 * 验证队列同步
 */
export function validateQueueSync(
  wakeQueueIds: number[],
  nightActionQueue: Seat[]
): boolean {
  const queueIds = nightActionQueue.map((seat) => seat.id);
  if (wakeQueueIds.length !== queueIds.length) return false;
  for (let i = 0; i < wakeQueueIds.length; i++) {
    if (wakeQueueIds[i] !== queueIds[i]) return false;
  }
  return true;
}
