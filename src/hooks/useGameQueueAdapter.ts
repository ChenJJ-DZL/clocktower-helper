"use client";

/**
 * 游戏队列适配器 Hook
 * 用于将旧的 wakeQueueIds/currentWakeIndex 系统与新 nightActionQueue 系统桥接
 * 提供向后兼容的接口
 */

import { useMemo } from "react";
import type { Seat } from "../../app/data";

/**
 * 将旧系统的 wakeQueueIds 和 currentWakeIndex 转换为新的队列系统
 * 这是一个临时适配器，用于逐步迁移
 */
export interface QueueAdapterState {
  // 旧系统接口（用于兼容）
  wakeQueueIds: number[];
  currentWakeIndex: number;
  
  // 新系统接口
  nightActionQueue: Seat[];
  currentQueueIndex: number;
  
  // 队列状态
  isQueueEmpty: boolean;
  isAtEndOfQueue: boolean;
  currentSeatId: number | undefined;
}

/**
 * 创建队列适配器状态
 * 用于在迁移期间保持新旧系统的兼容
 */
export function createQueueAdapter(
  nightActionQueue: Seat[],
  inputIndex: number
): QueueAdapterState {
  const wakeQueueIds = nightActionQueue.map(seat => seat.id);
  const currentQueueIndex = Math.max(0, Math.min(inputIndex, nightActionQueue.length - 1));
  const currentQueueItem = nightActionQueue[currentQueueIndex];
  
  return {
    // 旧系统
    wakeQueueIds,
    currentWakeIndex: currentQueueIndex,
    
    // 新系统
    nightActionQueue,
    currentQueueIndex,
    
    // 状态
    isQueueEmpty: nightActionQueue.length === 0,
    isAtEndOfQueue: currentQueueIndex >= nightActionQueue.length - 1,
    currentSeatId: currentQueueItem?.id,
  };
}

/**
 * 将旧系统的 wakeQueueIds 转换为 Seat[]
 * 需要传入完整的 seats 数组来查找对应的 Seat 对象
 */
export function convertWakeQueueIdsToSeats(
  wakeQueueIds: number[],
  seats: Seat[]
): Seat[] {
  return wakeQueueIds
    .map(id => seats.find(s => s.id === id))
    .filter((seat): seat is Seat => seat !== undefined);
}

/**
 * 验证队列同步
 * 检查 wakeQueueIds 和 nightActionQueue 是否同步
 */
export function validateQueueSync(
  wakeQueueIds: number[],
  nightActionQueue: Seat[]
): boolean {
  const queueIds = nightActionQueue.map(seat => seat.id);
  
  if (wakeQueueIds.length !== queueIds.length) {
    return false;
  }
  
  for (let i = 0; i < wakeQueueIds.length; i++) {
    if (wakeQueueIds[i] !== queueIds[i]) {
      return false;
    }
  }
  
  return true;
}

