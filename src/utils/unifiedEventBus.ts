/**
 * 统一游戏事件总线机制
 * 提供统一的事件发布、订阅、过滤和监控接口
 * 这是项目中唯一的事件总线系统
 */

import type { GameEventMap, GameEventType } from "./gameEventBus";

export interface EventListenerConfig<T extends GameEventType> {
  /** 监听器ID（用于取消监听） */
  listenerId: string;
  /** 事件类型 */
  eventType: T;
  /** 回调函数 */
  callback: (payload: GameEventMap[T]) => void;
  /** 优先级（数字越小越先执行） */
  priority?: number;
  /** 是否只触发一次 */
  once?: boolean;
  /** 过滤条件 */
  filter?: (payload: GameEventMap[T]) => boolean;
  /** 上下文数据 */
  context?: any;
}

export interface EventHistoryItem {
  /** 事件ID */
  eventId: string;
  /** 事件类型 */
  eventType: GameEventType;
  /** 事件数据 */
  payload: any;
  /** 时间戳 */
  timestamp: number;
  /** 触发者（可选） */
  source?: string;
}

export interface EventMonitorConfig {
  /** 是否记录事件历史 */
  enableHistory: boolean;
  /** 历史记录最大长度 */
  maxHistoryLength: number;
  /** 是否启用事件调试 */
  enableDebug: boolean;
  /** 是否启用性能监控 */
  enablePerformance: boolean;
}

/**
 * 统一游戏事件总线管理器
 */
class UnifiedEventBus {
  private listeners: Map<GameEventType, EventListenerConfig<any>[]> = new Map();
  private eventHistory: EventHistoryItem[] = [];
  private monitorConfig: EventMonitorConfig = {
    enableHistory: true,
    maxHistoryLength: 1000,
    enableDebug: false,
    enablePerformance: false,
  };
  private performanceStats: Map<string, { totalTime: number; count: number }> =
    new Map();

  /**
   * 初始化
   */
  constructor(config?: Partial<EventMonitorConfig>) {
    if (config) {
      this.monitorConfig = { ...this.monitorConfig, ...config };
    }
  }

  /**
   * 注册事件监听器
   */
  on<T extends GameEventType>(
    eventType: T,
    callback: (payload: GameEventMap[T]) => void,
    config?: Omit<
      EventListenerConfig<T>,
      "eventType" | "callback" | "listenerId"
    > & { listenerId?: string }
  ): string {
    const listenerId =
      config?.listenerId ||
      `listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const listenerConfig: EventListenerConfig<T> = {
      listenerId,
      eventType,
      callback,
      priority: config?.priority ?? 10,
      once: config?.once ?? false,
      filter: config?.filter,
      context: config?.context,
    };

    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }

    const listeners = this.listeners.get(eventType)!;
    listeners.push(listenerConfig);
    listeners.sort((a, b) => (a.priority || 10) - (b.priority || 10));

    if (this.monitorConfig.enableDebug) {
      console.log(`[UnifiedEventBus] 注册监听器: ${listenerId} (${eventType})`);
    }

    return listenerId;
  }

  /**
   * 取消事件监听
   */
  off(eventType: GameEventType, listenerId: string): boolean {
    const listeners = this.listeners.get(eventType);
    if (!listeners) {
      return false;
    }

    const initialLength = listeners.length;
    const filteredListeners = listeners.filter(
      (l) => l.listenerId !== listenerId
    );
    this.listeners.set(eventType, filteredListeners);

    const removed = initialLength !== filteredListeners.length;

    if (this.monitorConfig.enableDebug && removed) {
      console.log(`[UnifiedEventBus] 移除监听器: ${listenerId} (${eventType})`);
    }

    return removed;
  }

  /**
   * 发布事件
   */
  emit<T extends GameEventType>(eventType: T, payload: GameEventMap[T]): void {
    const startTime = this.monitorConfig.enablePerformance
      ? performance.now()
      : 0;

    // 记录事件历史
    if (this.monitorConfig.enableHistory) {
      const historyItem: EventHistoryItem = {
        eventId: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        eventType,
        payload,
        timestamp: Date.now(),
        source: "unified_event_bus",
      };

      this.eventHistory.push(historyItem);

      // 限制历史记录长度
      if (this.eventHistory.length > this.monitorConfig.maxHistoryLength) {
        this.eventHistory = this.eventHistory.slice(
          -this.monitorConfig.maxHistoryLength
        );
      }
    }

    // 执行所有监听器
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      // 创建监听器副本以避免在迭代过程中修改
      const listenersToExecute = [...listeners];

      for (const listenerConfig of listenersToExecute) {
        try {
          // 检查过滤条件
          if (listenerConfig.filter && !listenerConfig.filter(payload)) {
            continue;
          }

          // 执行回调
          listenerConfig.callback(payload);

          // 如果是一次性监听器，移除它
          if (listenerConfig.once) {
            this.off(eventType, listenerConfig.listenerId);
          }
        } catch (error) {
          console.error(
            `[UnifiedEventBus] 监听器执行错误: ${listenerConfig.listenerId}`,
            error
          );
        }
      }
    }

    // 更新性能统计
    if (this.monitorConfig.enablePerformance) {
      const endTime = performance.now();
      const duration = endTime - startTime;

      const stats = this.performanceStats.get(eventType) || {
        totalTime: 0,
        count: 0,
      };
      stats.totalTime += duration;
      stats.count += 1;
      this.performanceStats.set(eventType, stats);
    }

    if (this.monitorConfig.enableDebug) {
      console.log(`[UnifiedEventBus] 发布事件: ${eventType}`, payload);
    }
  }

  /**
   * 一次性事件监听
   */
  once<T extends GameEventType>(
    eventType: T,
    callback: (payload: GameEventMap[T]) => void,
    config?: Omit<
      EventListenerConfig<T>,
      "eventType" | "callback" | "once" | "listenerId"
    > & { listenerId?: string }
  ): string {
    return this.on(eventType, callback, { ...config, once: true });
  }

  /**
   * 获取事件历史
   */
  getEventHistory(filter?: {
    eventType?: GameEventType;
    startTime?: number;
    endTime?: number;
    source?: string;
  }): EventHistoryItem[] {
    let history = this.eventHistory;

    if (filter) {
      if (filter.eventType) {
        history = history.filter((item) => item.eventType === filter.eventType);
      }
      if (filter.startTime) {
        history = history.filter((item) => item.timestamp >= filter.startTime!);
      }
      if (filter.endTime) {
        history = history.filter((item) => item.timestamp <= filter.endTime!);
      }
      if (filter.source) {
        history = history.filter((item) => item.source === filter.source);
      }
    }

    return [...history];
  }

  /**
   * 清除事件历史
   */
  clearHistory(): void {
    this.eventHistory = [];
    if (this.monitorConfig.enableDebug) {
      console.log("[UnifiedEventBus] 已清除事件历史");
    }
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats(): Record<
    string,
    {
      totalTime: number;
      count: number;
      averageTime: number;
    }
  > {
    const stats: Record<string, any> = {};

    Array.from(this.performanceStats.entries()).forEach(([eventType, data]) => {
      stats[eventType] = {
        totalTime: data.totalTime,
        count: data.count,
        averageTime: data.count > 0 ? data.totalTime / data.count : 0,
      };
    });

    return stats;
  }

  /**
   * 重置性能统计
   */
  resetPerformanceStats(): void {
    this.performanceStats.clear();
    if (this.monitorConfig.enableDebug) {
      console.log("[UnifiedEventBus] 已重置性能统计");
    }
  }

  /**
   * 获取活跃监听器数量
   */
  getActiveListenerCount(eventType?: GameEventType): number {
    if (eventType) {
      return this.listeners.get(eventType)?.length || 0;
    }

    let total = 0;
    Array.from(this.listeners.values()).forEach((listeners) => {
      total += listeners.length;
    });
    return total;
  }

  /**
   * 清除所有监听器
   */
  clearAllListeners(): void {
    this.listeners.clear();

    if (this.monitorConfig.enableDebug) {
      console.log("[UnifiedEventBus] 已清除所有监听器");
    }
  }

  /**
   * 等待特定事件
   */
  waitForEvent<T extends GameEventType>(
    eventType: T,
    timeout?: number,
    filter?: (payload: GameEventMap[T]) => boolean
  ): Promise<GameEventMap[T]> {
    return new Promise((resolve, reject) => {
      const timer = timeout
        ? setTimeout(() => {
            this.off(eventType, listenerId);
            reject(new Error(`等待事件 ${eventType} 超时`));
          }, timeout)
        : null;

      const listenerId = this.once(
        eventType,
        (payload) => {
          if (filter && !filter(payload)) {
            return;
          }
          if (timer) clearTimeout(timer);
          resolve(payload);
        },
        {
          listenerId: `wait_${eventType}_${Date.now()}`,
        }
      );
    });
  }

  /**
   * 批量发布事件
   */
  emitBatch(events: Array<{ type: GameEventType; payload: any }>): void {
    for (const event of events) {
      this.emit(event.type, event.payload);
    }
  }

  /**
   * 获取事件统计
   */
  getEventStats(): Record<GameEventType, number> {
    const stats: Record<string, number> = {};

    for (const item of this.eventHistory) {
      stats[item.eventType] = (stats[item.eventType] || 0) + 1;
    }

    return stats;
  }
}

// 导出单例
export const unifiedEventBus = new UnifiedEventBus();

// 导出类型
export type { GameEventMap, GameEventType } from "./gameEventBus";
// 为了向后兼容，导出 gameEventBus 作为 unifiedEventBus 的别名
export const gameEventBus = unifiedEventBus;
