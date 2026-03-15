/**
 * 官方夜晚行动顺序解析器
 * 统一解析 josn/夜晚行动顺序.json，提供强类型的顺序映射
 */

import nightOrderDataRaw from "../../josn/夜晚行动顺序.json";

// 类型断言适配实际JSON结构
const nightOrderData = nightOrderDataRaw as any;

export interface NightOrderItem {
  /** 角色ID（与角色定义中的roleId对应） */
  roleId: string;
  /** 角色名称 */
  roleName: string;
  /** 首夜顺序优先级，数字越小越先行动，0表示不唤醒 */
  firstNightOrder: number;
  /** 其他夜晚顺序优先级，数字越小越先行动，0表示不唤醒 */
  otherNightOrder: number;
  /** 所属剧本 */
  script: string;
  /** 特殊唤醒条件说明 */
  wakeCondition?: string;
}

export type NightOrderMap = Map<string, Omit<NightOrderItem, "roleId">>;

class NightOrderParser {
  private firstNightOrder: NightOrderItem[] = [];
  private otherNightOrder: NightOrderItem[] = [];
  private roleOrderMap: NightOrderMap = new Map();

  constructor() {
    this.parse();
  }

  private parse(): void {
    // 解析首夜顺序
    if (Array.isArray(nightOrderData.firstNight)) {
      this.firstNightOrder = nightOrderData.firstNight.map(
        (item: any, index: number) => {
          const orderItem: NightOrderItem = {
            roleId: item.roleId || item.id,
            roleName: item.roleName || item.name,
            firstNightOrder: item.order || index + 1,
            otherNightOrder: item.otherNightOrder || 0,
            script: item.script || "通用",
            wakeCondition: item.wakeCondition,
          };
          this.roleOrderMap.set(orderItem.roleId, {
            roleName: orderItem.roleName,
            firstNightOrder: orderItem.firstNightOrder,
            otherNightOrder: orderItem.otherNightOrder,
            script: orderItem.script,
            wakeCondition: orderItem.wakeCondition,
          });
          return orderItem;
        }
      );
    }

    // 解析其他夜晚顺序
    if (Array.isArray(nightOrderData.otherNight)) {
      this.otherNightOrder = nightOrderData.otherNight.map(
        (item: any, index: number) => {
          const orderItem: NightOrderItem = {
            roleId: item.roleId || item.id,
            roleName: item.roleName || item.name,
            firstNightOrder: item.firstNightOrder || 0,
            otherNightOrder: item.order || index + 1,
            script: item.script || "通用",
            wakeCondition: item.wakeCondition,
          };
          // 更新映射表，如果已有则补充otherNightOrder
          if (this.roleOrderMap.has(orderItem.roleId)) {
            const existing = this.roleOrderMap.get(orderItem.roleId)!;
            this.roleOrderMap.set(orderItem.roleId, {
              ...existing,
              otherNightOrder: orderItem.otherNightOrder,
            });
          } else {
            this.roleOrderMap.set(orderItem.roleId, {
              roleName: orderItem.roleName,
              firstNightOrder: orderItem.firstNightOrder,
              otherNightOrder: orderItem.otherNightOrder,
              script: orderItem.script,
              wakeCondition: orderItem.wakeCondition,
            });
          }
          return orderItem;
        }
      );
    }

    // 排序
    this.firstNightOrder.sort((a, b) => a.firstNightOrder - b.firstNightOrder);
    this.otherNightOrder.sort((a, b) => a.otherNightOrder - b.otherNightOrder);
  }

  /**
   * 获取首夜完整行动顺序
   */
  getFirstNightOrder(): NightOrderItem[] {
    return [...this.firstNightOrder];
  }

  /**
   * 获取其他夜晚完整行动顺序
   */
  getOtherNightOrder(): NightOrderItem[] {
    return [...this.otherNightOrder];
  }

  /**
   * 获取指定角色的夜晚顺序配置
   */
  getRoleOrder(roleId: string): Omit<NightOrderItem, "roleId"> | undefined {
    return this.roleOrderMap.get(roleId);
  }

  /**
   * 检查角色在指定夜晚是否需要唤醒
   */
  shouldWake(roleId: string, isFirstNight: boolean): boolean {
    const order = this.roleOrderMap.get(roleId);
    if (!order) return false;
    const orderValue = isFirstNight
      ? order.firstNightOrder
      : order.otherNightOrder;
    return orderValue > 0;
  }

  /**
   * 获取角色在指定夜晚的优先级
   */
  getRolePriority(roleId: string, isFirstNight: boolean): number {
    const order = this.roleOrderMap.get(roleId);
    if (!order) return 999;
    return isFirstNight ? order.firstNightOrder : order.otherNightOrder;
  }
}

// 导出单例
export const nightOrderParser = new NightOrderParser();
