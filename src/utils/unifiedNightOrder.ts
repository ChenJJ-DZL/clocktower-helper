/**
 * 统一夜晚行动顺序机制
 * 整合 nightOrderParser、nightOrderOverrides 等组件
 * 使用动态队列生成器 dynamicQueueGenerator
 */

import type { Seat } from "../../app/data";
import { generateDynamicNightQueue } from "./dynamicQueueGenerator";
import { getNightOrderOverride } from "./nightOrderOverrides";
import { nightOrderParser } from "./nightOrderParser";

export interface UnifiedNightOrderConfig {
  /** 是否为首夜 */
  isFirstNight: boolean;
  /** 是否启用官方夜晚顺序解析 */
  enableOfficialOrder: boolean;
  /** 是否启用角色定义顺序 */
  enableRoleDefinitionOrder: boolean;
  /** 是否启用覆盖顺序 */
  enableOverrideOrder: boolean;
}

export interface NightOrderResult {
  /** 排序后的座位列表 */
  sortedSeats: Seat[];
  /** 每个座位的顺序信息 */
  orderDetails: Array<{
    seatId: number;
    roleId: string;
    roleName: string;
    order: number;
    source: "official" | "roleDefinition" | "override" | "fallback";
    wakeCondition?: string;
  }>;
  /** 总队列长度 */
  totalItems: number;
  /** 是否为首夜 */
  isFirstNight: boolean;
}

/**
 * 统一夜晚行动顺序生成器
 */
class UnifiedNightOrder {
  /**
   * 生成夜晚行动队列
   */
  generateQueue(
    seats: Seat[],
    config: Partial<UnifiedNightOrderConfig> = {}
  ): NightOrderResult {
    const fullConfig: UnifiedNightOrderConfig = {
      isFirstNight: false,
      enableOfficialOrder: true,
      enableRoleDefinitionOrder: true,
      enableOverrideOrder: true,
      ...config,
    };

    // 使用动态队列生成器
    const fullNightOrder: import("./dynamicQueueGenerator").NightOrderEntry[] =
      [
        ...nightOrderParser.getFirstNightOrder().map((item) => ({
          roleId: item.roleId,
          roleName: item.roleName || item.roleId,
          priority: item.firstNightOrder,
          firstNightOnly: true,
          wakeMessage: item.wakeCondition || "",
          abilityId: `${item.roleId}_night_ability`,
        })),
        ...nightOrderParser.getOtherNightOrder().map((item) => ({
          roleId: item.roleId,
          roleName: item.roleName || item.roleId,
          priority: item.otherNightOrder,
          firstNightOnly: false,
          wakeMessage: item.wakeCondition || "",
          abilityId: `${item.roleId}_night_ability`,
        })),
      ];
    const snapshot = {
      nightCount: fullConfig.isFirstNight ? 1 : 2,
      seats: seats.map((s, i) => ({
        id: i,
        role: s.role
          ? {
              id: s.role.id,
              name: s.role.name,
              type: s.role.type || "townsfolk",
            }
          : undefined,
        isAlive: !s.isDead,
        isDead: s.isDead || false,
      })),
      statusEffects: {} as Record<string, any[]>,
      gamePhase: fullConfig.isFirstNight
        ? ("firstNight" as const)
        : ("night" as const),
    };
    const queue = generateDynamicNightQueue(fullNightOrder, snapshot, {
      isFirstNight: fullConfig.isFirstNight,
    });

    // 收集详细顺序信息
    const orderDetails: NightOrderResult["orderDetails"] = [];

    for (const node of queue) {
      const seat = seats.find((s) => s.id === node.seatId);
      if (!seat || !seat.role) continue;

      const effectiveRoleId =
        seat.role.id === "drunk" ? seat.charadeRole?.id || null : seat.role.id;
      if (!effectiveRoleId) continue;

      let order = 999;
      let source: NightOrderResult["orderDetails"][0]["source"] = "fallback";
      let wakeCondition: string | undefined;

      // 1. 检查覆盖顺序
      if (fullConfig.enableOverrideOrder) {
        const overrideOrder = getNightOrderOverride(
          effectiveRoleId,
          fullConfig.isFirstNight
        );
        if (overrideOrder !== null) {
          order = overrideOrder;
          source = "override";
        }
      }

      // 2. 检查官方顺序
      if (fullConfig.enableOfficialOrder && source === "fallback") {
        const officialOrder = nightOrderParser.getRolePriority(
          effectiveRoleId,
          fullConfig.isFirstNight
        );
        if (officialOrder > 0 && officialOrder < 999) {
          order = officialOrder;
          source = "official";
          const roleOrder = nightOrderParser.getRoleOrder(effectiveRoleId);
          wakeCondition = roleOrder?.wakeCondition;
        }
      }

      orderDetails.push({
        seatId: node.seatId,
        roleId: effectiveRoleId,
        roleName: seat.role.name,
        order,
        source,
        wakeCondition,
      });
    }

    return {
      sortedSeats: queue
        .map((n) => seats.find((s) => s.id === n.seatId))
        .filter(Boolean) as Seat[],
      orderDetails,
      totalItems: queue.length,
      isFirstNight: fullConfig.isFirstNight,
    };
  }

  /**
   * 获取角色唤醒信息
   */
  getRoleWakeInfo(
    roleId: string,
    isFirstNight: boolean
  ): {
    shouldWake: boolean;
    order: number;
    source: string;
    wakeCondition?: string;
  } {
    // 检查是否应该唤醒
    const shouldWake = nightOrderParser.shouldWake(roleId, isFirstNight);
    const order = nightOrderParser.getRolePriority(roleId, isFirstNight);
    const roleOrder = nightOrderParser.getRoleOrder(roleId);

    return {
      shouldWake,
      order,
      source: "official",
      wakeCondition: roleOrder?.wakeCondition,
    };
  }

  /**
   * 获取夜晚顺序预览
   */
  getNightOrderPreview(
    seats: Seat[],
    isFirstNight: boolean
  ): Array<{
    seatNumber: number;
    roleName: string;
    order: number;
    wakeTime: string;
  }> {
    const result = this.generateQueue(seats, { isFirstNight });

    return result.orderDetails.map((detail) => {
      // 根据order值估算唤醒时间
      const wakeTime = this.estimateWakeTime(detail.order, isFirstNight);

      return {
        seatNumber: detail.seatId + 1, // 转换为显示编号
        roleName: detail.roleName,
        order: detail.order,
        wakeTime,
      };
    });
  }

  /**
   * 估算唤醒时间
   */
  private estimateWakeTime(order: number, _isFirstNight: boolean): string {
    if (order <= 0) return "不唤醒";
    if (order >= 999) return "未知";

    // 根据order值估算时间（每10个order约1分钟）
    const minutes = Math.floor(order / 10);
    const seconds = (order % 10) * 6; // 每1个order约6秒

    if (minutes === 0) {
      return `约${seconds}秒`;
    } else if (seconds === 0) {
      return `约${minutes}分钟`;
    } else {
      return `约${minutes}分${seconds}秒`;
    }
  }

  /**
   * 验证夜晚顺序
   */
  validateNightOrder(
    seats: Seat[],
    isFirstNight: boolean
  ): {
    isValid: boolean;
    warnings: string[];
    errors: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];

    const result = this.generateQueue(seats, { isFirstNight });

    // 检查是否有重复的order值
    const orderMap = new Map<number, number[]>();
    result.orderDetails.forEach((detail) => {
      if (!orderMap.has(detail.order)) {
        orderMap.set(detail.order, []);
      }
      orderMap.get(detail.order)!.push(detail.seatId);
    });

    // 找出重复order
    Array.from(orderMap.entries()).forEach(([order, seatIds]) => {
      if (seatIds.length > 1) {
        warnings.push(
          `顺序值${order}被多个座位(${seatIds.map((id) => id + 1).join(", ")})使用，可能导致同时唤醒`
        );
      }
    });

    // 检查是否有角色应该唤醒但没有在队列中
    const queuedRoleIds = new Set(result.orderDetails.map((d) => d.roleId));
    seats.forEach((seat) => {
      if (!seat.role) return;

      const effectiveRoleId =
        seat.role.id === "drunk" ? seat.charadeRole?.id || null : seat.role.id;

      if (effectiveRoleId && !queuedRoleIds.has(effectiveRoleId)) {
        const shouldWake = nightOrderParser.shouldWake(
          effectiveRoleId,
          isFirstNight
        );
        if (shouldWake) {
          warnings.push(
            `座位${seat.id + 1}的${seat.role.name}应该被唤醒但不在队列中`
          );
        }
      }
    });

    return {
      isValid: errors.length === 0,
      warnings,
      errors,
    };
  }
}

// 导出单例
export const unifiedNightOrder = new UnifiedNightOrder();

// 导出类型
export type { NightOrderItem } from "./nightOrderParser";
