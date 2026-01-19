"use client";

import type { Seat } from "../../app/data";
import { getRoleDefinition } from "../roles";

/**
 * 夜间行动队列项接口
 */
export interface NightQueueItem {
  seat: Seat;
  seatId: number;
  roleId: string;
  order: number; // 行动优先级顺序
  isFirstNightOnly: boolean; // 是否仅在首夜行动
}

/**
 * 动态生成夜间行动队列
 * 根据存活角色的角色定义自动生成有序的行动队列
 * 
 * @param seats 所有座位
 * @param isFirstNight 是否为首夜
 * @returns 排序后的夜间行动队列
 */
export function generateNightActionQueue(
  seats: Seat[],
  isFirstNight: boolean
): Seat[] {
  const queueItems: NightQueueItem[] = [];
  
  // 遍历所有座位，收集需要唤醒的角色
  for (const seat of seats) {
    if (!seat.role) continue;
    
    // 处理酒鬼：酒鬼的实际角色是 charadeRole（镇民角色）
    const effectiveRoleId = seat.role.id === 'drunk' 
      ? (seat.charadeRole?.id || null)
      : seat.role.id;
    
    if (!effectiveRoleId) continue;
    
    // 从角色定义系统获取角色信息
    const roleDef = getRoleDefinition(effectiveRoleId);
    
    if (!roleDef) {
      console.warn(`[generateNightActionQueue] 角色 ${effectiveRoleId} 未找到定义，跳过`);
      continue;
    }
    
    // 检查是否死亡 - 如果死亡，需要特殊权限才能唤醒
    if (seat.isDead) {
      if (seat.hasAbilityEvenDead) {
        // 死亡但保留能力的角色（如亡骨魔杀死的爪牙）
        // 使用其角色的夜晚行动顺序
        const getOrderValue = (orderConfig: number | ((isFirstNight: boolean) => number) | undefined): number => {
          if (orderConfig === undefined) return 999;
          if (typeof orderConfig === 'number') return orderConfig;
          if (typeof orderConfig === 'function') return orderConfig(isFirstNight);
          return 999;
        };
        
        const firstNightOrder = roleDef.firstNight ? getOrderValue(roleDef.firstNight.order) : 999;
        const nightOrder = roleDef.night ? getOrderValue(roleDef.night.order) : 999;
        const order = isFirstNight 
          ? (firstNightOrder !== 999 ? firstNightOrder : nightOrder)
          : nightOrder;
        
        // CRITICAL FIX: Skip roles with order <= 0 (0 means "don't wake")
        // Order 0 or negative means the role should not be awakened this night
        if (order > 0 && order < 999) {
          queueItems.push({
            seat,
            seatId: seat.id,
            roleId: effectiveRoleId,
            order,
            isFirstNightOnly: !!roleDef.firstNight && !roleDef.night,
          });
        }
      }
      // 默认情况下，死亡的角色不应该被唤醒（除非有hasAbilityEvenDead标记）
      continue;
    }
    
    // 检查角色是否有夜晚行动配置
    const hasFirstNightAction = !!roleDef.firstNight;
    const hasNightAction = !!roleDef.night;
    
    // 获取order值（order可以是number或函数）
    const getOrderValue = (orderConfig: number | ((isFirstNight: boolean) => number) | undefined): number => {
      if (orderConfig === undefined) return 999;
      if (typeof orderConfig === 'number') return orderConfig;
      if (typeof orderConfig === 'function') return orderConfig(isFirstNight);
      return 999;
    };
    
    if (isFirstNight) {
      // 首夜：优先检查 firstNight，如果没有则检查 night
      if (hasFirstNightAction || hasNightAction) {
        const firstNightOrder = hasFirstNightAction 
          ? getOrderValue(roleDef.firstNight?.order)
          : 999;
        const nightOrder = hasNightAction
          ? getOrderValue(roleDef.night?.order)
          : 999;
        // 首夜优先使用firstNight的order，如果没有则使用night的order
        const order = hasFirstNightAction ? firstNightOrder : nightOrder;
        // CRITICAL FIX: Skip roles with order <= 0 (0 means "don't wake")
        // Order 0 or negative means the role should not be awakened this night
        if (order > 0 && order < 999) {
          queueItems.push({
            seat,
            seatId: seat.id,
            roleId: effectiveRoleId,
            order,
            isFirstNightOnly: hasFirstNightAction && !hasNightAction,
          });
        }
      }
    } else {
      // 后续夜晚：只检查 night（firstNight 只在首夜生效）
      if (hasNightAction) {
        const order = getOrderValue(roleDef.night?.order);
        // CRITICAL FIX: Skip roles with order <= 0 (0 means "don't wake")
        // Order 0 or negative means the role should not be awakened this night
        if (order > 0 && order < 999) {
          queueItems.push({
            seat,
            seatId: seat.id,
            roleId: effectiveRoleId,
            order,
            isFirstNightOnly: false,
          });
        }
      }
    }
  }
  
  // 按优先级排序（order 越小越靠前）
  queueItems.sort((a, b) => {
    // 首先按 order 排序
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    // order 相同时，按座位ID排序（保持稳定性）
    return a.seatId - b.seatId;
  });
  
  // 提取排序后的座位
  const sortedSeats = queueItems.map(item => item.seat);
  
  // Debug logging
  console.log(`[generateNightActionQueue] ${isFirstNight ? 'First night' : 'Night'} - Processing ${seats.length} seats`);
  console.log(`[generateNightActionQueue] Generated ${queueItems.length} queue items:`, 
    queueItems.map(item => ({
      seatId: item.seatId + 1,
      roleId: item.roleId,
      roleName: item.seat.role?.name,
      order: item.order,
    }))
  );
  
  // If queue is empty, log detailed debug info
  if (queueItems.length === 0) {
    console.warn('[generateNightActionQueue] ⚠️ Queue is empty! Checking roles:');
    seats.forEach(seat => {
      if (!seat.role) {
        console.warn(`  - Seat ${seat.id + 1}: No role`);
        return;
      }
      const effectiveRoleId = seat.role.id === 'drunk' 
        ? (seat.charadeRole?.id || null)
        : seat.role.id;
      if (!effectiveRoleId) {
        console.warn(`  - Seat ${seat.id + 1}: No effective role (drunk without charadeRole)`);
        return;
      }
      const roleDef = getRoleDefinition(effectiveRoleId);
      if (!roleDef) {
        console.warn(`  - Seat ${seat.id + 1} (${seat.role.name}): Role definition not found`);
        return;
      }
      const hasFirstNight = !!roleDef.firstNight;
      const hasNight = !!roleDef.night;
      const getOrderValue = (orderConfig: number | ((isFirstNight: boolean) => number) | undefined): number => {
        if (orderConfig === undefined) return 999;
        if (typeof orderConfig === 'number') return orderConfig;
        if (typeof orderConfig === 'function') return orderConfig(isFirstNight);
        return 999;
      };
      const firstNightOrder = hasFirstNight ? getOrderValue(roleDef.firstNight?.order) : 999;
      const nightOrder = hasNight ? getOrderValue(roleDef.night?.order) : 999;
      const order = isFirstNight ? (hasFirstNight ? firstNightOrder : nightOrder) : nightOrder;
      console.warn(`  - Seat ${seat.id + 1} (${seat.role.name}): firstNight=${hasFirstNight}(${firstNightOrder}), night=${hasNight}(${nightOrder}), finalOrder=${order}, isDead=${seat.isDead}, hasAbilityEvenDead=${seat.hasAbilityEvenDead}`);
      if (order <= 0 || order >= 999) {
        console.warn(`    ⚠️ Skipped: order ${order} is invalid (should be > 0 and < 999)`);
      }
    });
  }
  
  return sortedSeats;
}

/**
 * 过滤无效的队列项（如已死亡且无能力的角色）
 * 
 * @param queue 当前队列
 * @param seats 所有座位（用于获取最新状态）
 * @returns 过滤后的队列
 */
export function filterValidNightQueue(
  queue: Seat[],
  seats: Seat[]
): Seat[] {
  return queue.filter(queuedSeat => {
    // 从最新座位状态中查找
    const currentSeat = seats.find(s => s.id === queuedSeat.id);
    if (!currentSeat) return false;
    
    // 如果已死亡且无能力，则过滤掉（亡骨魔杀死的爪牙等保留能力的除外）
    if (currentSeat.isDead && !currentSeat.hasAbilityEvenDead) {
      return false;
    }
    
    return true;
  });
}

/**
 * 获取当前队列项的索引
 * 
 * @param queue 队列
 * @param currentSeatId 当前座位ID
 * @returns 队列索引，如果未找到返回 -1
 */
export function getQueueIndex(
  queue: Seat[],
  currentSeatId: number
): number {
  return queue.findIndex(seat => seat.id === currentSeatId);
}

/**
 * 获取下一个有效的队列索引
 * 自动跳过已死亡且无能力的角色
 * 
 * @param queue 队列
 * @param currentIndex 当前索引
 * @param seats 所有座位（用于获取最新状态）
 * @returns 下一个有效索引，如果没有则返回队列长度
 */
export function getNextValidQueueIndex(
  queue: Seat[],
  currentIndex: number,
  seats: Seat[]
): number {
  let nextIndex = currentIndex + 1;
  
  while (nextIndex < queue.length) {
    const nextSeat = queue[nextIndex];
    const currentSeat = seats.find(s => s.id === nextSeat.id);
    
    // 检查是否为有效队列项
    if (currentSeat && (!currentSeat.isDead || currentSeat.hasAbilityEvenDead)) {
      return nextIndex;
    }
    
    nextIndex++;
  }
  
  // 如果没有找到下一个有效项，返回队列长度（表示队列结束）
  return queue.length;
}

