"use client";

import type { Seat } from "../../app/data";
import { getRoleDefinition } from "../roles";
import { getNightOrderOverride } from "./nightOrderOverrides";

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
 * 隐性规则6：夜晚行动过时不候
 * 在夜晚时，如果已经开始某个角色的能力结算，那么当晚任何新创建出来的这种角色
 * 及具有这种角色能力的角色都不会在当晚进行相应的行动。
 *
 * 示例：
 * - 轮到小恶魔行动，小恶魔的自杀使得一名爪牙变成了小恶魔，因为夜晚行动已经结算到小恶魔，
 *   因此新的小恶魔不会在当晚行动。
 * - 痢蛭杀死了理发师后，交换了自己和一名爪牙的角色，新的痢蛭仍然需要进行选择宿主的行动，
 *   因为痢蛭非首夜的夜晚行动中只包含"攻击一名玩家"这个部分，而痢蛭的选择宿主是进场能力，会正常被触发。
 *
 * 注意：此函数在夜晚开始时调用，生成初始队列。如果在夜晚过程中角色发生变化，
 * 新创建的角色不会自动加入队列（需要手动处理）。
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
    const effectiveRoleId =
      seat.role.id === "drunk" ? seat.charadeRole?.id || null : seat.role.id;

    if (!effectiveRoleId) continue;

    // 从角色定义系统获取角色信息
    const roleDef = getRoleDefinition(effectiveRoleId);

    if (!roleDef) {
      console.warn(
        `[generateNightActionQueue] 角色 ${effectiveRoleId} 未找到定义，跳过`
      );
      continue;
    }

    // 检查是否死亡 - 如果死亡，需要特殊权限才能唤醒
    if (seat.isDead) {
      if (seat.hasAbilityEvenDead) {
        // 死亡但保留能力的角色（如亡骨魔杀死的爪牙）
        // 使用其角色的夜晚行动顺序
        const getOrderValue = (
          orderConfig: number | ((isFirstNight: boolean) => number) | undefined
        ): number => {
          if (orderConfig === undefined) return 999;
          if (typeof orderConfig === "number") return orderConfig;
          if (typeof orderConfig === "function")
            return orderConfig(isFirstNight);
          return 999;
        };

        const firstNightOrder = roleDef.firstNight
          ? getOrderValue(roleDef.firstNight.order)
          : 999;
        const nightOrder = roleDef.night
          ? getOrderValue(roleDef.night.order)
          : 999;
        const order = isFirstNight
          ? firstNightOrder !== 999
            ? firstNightOrder
            : nightOrder
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
    const getOrderValue = (
      orderConfig: number | ((isFirstNight: boolean) => number) | undefined
    ): number => {
      if (orderConfig === undefined) return 999;
      if (typeof orderConfig === "number") return orderConfig;
      if (typeof orderConfig === "function") return orderConfig(isFirstNight);
      return 999;
    };

    // 优先使用全局夜晚顺序覆盖表
    const overrideOrder = getNightOrderOverride(effectiveRoleId, isFirstNight);
    if (overrideOrder !== null) {
      queueItems.push({
        seat,
        seatId: seat.id,
        roleId: effectiveRoleId,
        order: overrideOrder,
        isFirstNightOnly: !!roleDef.firstNight && !roleDef.night,
      });
      continue;
    }

    if (isFirstNight) {
      // 首夜：优先检查 firstNight
      // 如果没有 firstNight 且该角色没有在全局首夜表 (overrideOrder) 中被捕获，则表示不应在首夜唤醒
      if (hasFirstNightAction) {
        const order = getOrderValue(roleDef.firstNight?.order);
        if (order > 0 && order < 999) {
          queueItems.push({
            seat,
            seatId: seat.id,
            roleId: effectiveRoleId,
            order,
            isFirstNightOnly: !hasNightAction,
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
  const sortedSeats = queueItems.map((item) => item.seat);

  // Debug logging
  console.log(
    `[generateNightActionQueue] ${isFirstNight ? "First night" : "Night"} - Processing ${seats.length} seats`
  );
  console.log(
    `[generateNightActionGenerator] Generated ${queueItems.length} queue items:`,
    queueItems.map((item) => ({
      seatId: item.seatId + 1,
      roleId: item.roleId,
      roleName: item.seat.role?.name,
      order: item.order,
    }))
  );

  // If queue is empty, log detailed debug info
  if (queueItems.length === 0) {
    console.warn(
      "[generateNightActionQueue] ⚠️ Queue is empty! Checking roles:"
    );
    seats.forEach((seat) => {
      if (!seat.role) {
        console.warn(`  - Seat ${seat.id + 1}: No role`);
        return;
      }
      const effectiveRoleId =
        seat.role.id === "drunk" ? seat.charadeRole?.id || null : seat.role.id;
      if (!effectiveRoleId) {
        console.warn(
          `  - Seat ${seat.id + 1}: No effective role (drunk without charadeRole)`
        );
        return;
      }
      const roleDef = getRoleDefinition(effectiveRoleId);
      if (!roleDef) {
        console.warn(
          `  - Seat ${seat.id + 1} (${seat.role.name}): Role definition not found`
        );
        return;
      }
      const hasFirstNight = !!roleDef.firstNight;
      const hasNight = !!roleDef.night;
      const getOrderValue = (
        orderConfig: number | ((isFirstNight: boolean) => number) | undefined
      ): number => {
        if (orderConfig === undefined) return 999;
        if (typeof orderConfig === "number") return orderConfig;
        if (typeof orderConfig === "function") return orderConfig(isFirstNight);
        return 999;
      };
      const firstNightOrder = hasFirstNight
        ? getOrderValue(roleDef.firstNight?.order)
        : 999;
      const nightOrder = hasNight ? getOrderValue(roleDef.night?.order) : 999;
      const order = isFirstNight
        ? hasFirstNight
          ? firstNightOrder
          : nightOrder
        : nightOrder;
      console.warn(
        `  - Seat ${seat.id + 1} (${seat.role.name}): firstNight=${hasFirstNight}(${firstNightOrder}), night=${hasNight}(${nightOrder}), finalOrder=${order}, isDead=${seat.isDead}, hasAbilityEvenDead=${seat.hasAbilityEvenDead}`
      );
      if (order <= 0 || order >= 999) {
        console.warn(
          `    ⚠️ Skipped: order ${order} is invalid (should be > 0 and < 999)`
        );
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
export function filterValidNightQueue(queue: Seat[], seats: Seat[]): Seat[] {
  return queue.filter((queuedSeat) => {
    // 从最新座位状态中查找
    const currentSeat = seats.find((s) => s.id === queuedSeat.id);
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
export function getQueueIndex(queue: Seat[], currentSeatId: number): number {
  return queue.findIndex((seat) => seat.id === currentSeatId);
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
    const currentSeat = seats.find((s) => s.id === nextSeat.id);

    // 检查是否为有效队列项
    if (
      currentSeat &&
      (!currentSeat.isDead || currentSeat.hasAbilityEvenDead)
    ) {
      return nextIndex;
    }

    nextIndex++;
  }

  // 如果没有找到下一个有效项，返回队列长度（表示队列结束）
  return queue.length;
}

/**
 * 动态插入新的角色到夜晚行动队列
 * 支持中途角色变化时插入结算
 *
 * 规则：
 * 1. 如果角色在夜晚过程中获得新能力，需要插入到队列中
 * 2. 插入位置根据角色的夜晚行动顺序决定
 * 3. 如果当前已经处理过该角色的行动顺序，则不插入
 *
 * @param queue 当前队列
 * @param newSeat 新角色座位
 * @param isFirstNight 是否为首夜
 * @param currentWakeIndex 当前唤醒索引
 * @returns 更新后的队列
 */
export function insertNewRoleIntoQueue(
  queue: Seat[],
  newSeat: Seat,
  isFirstNight: boolean,
  currentWakeIndex: number
): Seat[] {
  if (!newSeat.role) return queue;

  // 获取角色的夜晚行动顺序
  const effectiveRoleId =
    newSeat.role.id === "drunk"
      ? newSeat.charadeRole?.id || null
      : newSeat.role.id;

  if (!effectiveRoleId) return queue;

  const roleDef = getRoleDefinition(effectiveRoleId);
  if (!roleDef) return queue;

  // 检查角色是否已经在队列中
  const alreadyInQueue = queue.some((seat) => seat.id === newSeat.id);
  if (alreadyInQueue) return queue;

  // 获取角色的夜晚行动顺序
  const getOrderValue = (
    orderConfig: number | ((isFirstNight: boolean) => number) | undefined
  ): number => {
    if (orderConfig === undefined) return 999;
    if (typeof orderConfig === "number") return orderConfig;
    if (typeof orderConfig === "function") return orderConfig(isFirstNight);
    return 999;
  };

  let order = 999;

  if (isFirstNight && roleDef.firstNight) {
    order = getOrderValue(roleDef.firstNight.order);
  } else if (roleDef.night) {
    order = getOrderValue(roleDef.night.order);
  }

  // 如果order <= 0或>= 999，表示角色不应该在当晚行动
  if (order <= 0 || order >= 999) return queue;

  // 创建新的队列项
  const newQueueItem = {
    seat: newSeat,
    seatId: newSeat.id,
    roleId: effectiveRoleId,
    order,
    isFirstNightOnly: !!roleDef.firstNight && !roleDef.night,
  };

  // 查找插入位置
  let insertIndex = queue.length;

  for (let i = currentWakeIndex; i < queue.length; i++) {
    const item = queue[i];
    // 修复：Seat类型没有order属性，我们需要获取队列中每个座位的角色夜晚行动顺序
    const itemRoleId =
      item.role?.id === "drunk" ? item.charadeRole?.id || null : item.role?.id;

    if (!itemRoleId) continue;

    const itemRoleDef = getRoleDefinition(itemRoleId);
    if (!itemRoleDef) continue;

    // 获取队列中座位的夜晚行动顺序
    const getItemOrderValue = (
      orderConfig: number | ((isFirstNight: boolean) => number) | undefined
    ): number => {
      if (orderConfig === undefined) return 999;
      if (typeof orderConfig === "number") return orderConfig;
      if (typeof orderConfig === "function") return orderConfig(isFirstNight);
      return 999;
    };

    let itemOrder = 999;

    if (isFirstNight && itemRoleDef.firstNight) {
      itemOrder = getItemOrderValue(itemRoleDef.firstNight.order);
    } else if (itemRoleDef.night) {
      itemOrder = getItemOrderValue(itemRoleDef.night.order);
    }

    if (order < itemOrder) {
      insertIndex = i;
      break;
    } else if (order === itemOrder && newSeat.id < item.id) {
      insertIndex = i;
      break;
    }
  }

  // 插入到队列中
  const newQueue = [...queue];
  newQueue.splice(insertIndex, 0, newSeat);

  console.log(
    `[insertNewRoleIntoQueue] 插入新角色到队列: 座位${newSeat.id + 1}号, 角色${newSeat.role.name}, 顺序${order}, 插入位置${insertIndex}`
  );

  return newQueue;
}
