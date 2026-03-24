/**
 * 持续检测型能力管理器
 * 用于支持占卜师、茶艺师、哲学家等需要持续检测状态变化的能力
 */

import { type GameEventMap, unifiedEventBus } from "./unifiedEventBus";

export interface ContinuousDetectionConfig {
  /** 检测器ID */
  detectorId: string;
  /** 关联的角色ID */
  roleId: string;
  /** 关联的玩家ID */
  seatId: number;
  /** 检测的事件类型 */
  eventTypes: Array<keyof GameEventMap>;
  /** 检测条件 */
  condition?: (payload: any) => boolean;
  /** 检测到变化时的回调 */
  callback: (payload: any, context: DetectionContext) => Promise<void> | void;
  /** 是否在玩家死亡后仍然生效 */
  persistAfterDeath?: boolean;
  /** 有效期限 */
  validUntil?: {
    type: "night" | "day";
    count: number;
  };
}

export interface DetectionContext {
  /** 检测器配置 */
  config: ContinuousDetectionConfig;
  /** 检测开始时间 */
  startTime: number;
  /** 检测到的变化次数 */
  detectionCount: number;
  /** 最后检测时间 */
  lastDetectionTime: number;
  /** 额外数据 */
  extraData?: Record<string, any>;
}

/**
 * 持续检测型能力管理器
 */
class ContinuousDetectionManager {
  private detectors: Map<string, ContinuousDetectionConfig> = new Map();
  private detectionContexts: Map<string, DetectionContext> = new Map();

  /**
   * 注册持续检测器
   */
  registerDetector(config: ContinuousDetectionConfig): void {
    const detectorId = config.detectorId;

    // 注册事件监听
    for (const eventType of config.eventTypes) {
      unifiedEventBus.on(
        eventType,
        (payload) => {
          this.handleEvent(detectorId, eventType, payload);
        },
        {
          listenerId: `${detectorId}_${eventType}`,
          filter: config.condition,
        }
      );
    }

    this.detectors.set(detectorId, config);
    this.detectionContexts.set(detectorId, {
      config,
      startTime: Date.now(),
      detectionCount: 0,
      lastDetectionTime: Date.now(),
    });

    console.log(
      `[ContinuousDetectionManager] 注册检测器: ${detectorId} (${config.roleId})`
    );
  }

  /**
   * 处理事件
   */
  private async handleEvent(
    detectorId: string,
    eventType: keyof GameEventMap,
    payload: any
  ): Promise<void> {
    const config = this.detectors.get(detectorId);
    const context = this.detectionContexts.get(detectorId);

    if (!config || !context) {
      return;
    }

    // 检查是否已过期
    if (config.validUntil) {
      // 这里需要根据游戏状态检查是否过期
      // 暂时跳过实现，需要游戏状态信息
    }

    // 更新上下文
    context.detectionCount++;
    context.lastDetectionTime = Date.now();

    try {
      // 执行回调
      await config.callback(payload, context);
    } catch (error) {
      console.error(
        `[ContinuousDetectionManager] 检测器回调错误: ${detectorId}`,
        error
      );
    }
  }

  /**
   * 移除检测器
   */
  removeDetector(detectorId: string): void {
    // 移除事件监听
    const config = this.detectors.get(detectorId);
    if (config) {
      for (const eventType of config.eventTypes) {
        unifiedEventBus.off(eventType, `${detectorId}_${eventType}`);
      }
    }

    this.detectors.delete(detectorId);
    this.detectionContexts.delete(detectorId);

    console.log(`[ContinuousDetectionManager] 移除检测器: ${detectorId}`);
  }

  /**
   * 移除指定玩家的所有检测器
   */
  removePlayerDetectors(
    seatId: number,
    includePersistAfterDeath: boolean = false
  ): void {
    // 使用Array.from()避免downlevelIteration问题
    Array.from(this.detectors.entries()).forEach(([detectorId, config]) => {
      if (
        config.seatId === seatId &&
        (!config.persistAfterDeath || includePersistAfterDeath)
      ) {
        this.removeDetector(detectorId);
      }
    });
  }

  /**
   * 获取检测器状态
   */
  getDetectorStatus(detectorId: string): DetectionContext | undefined {
    return this.detectionContexts.get(detectorId);
  }

  /**
   * 获取玩家的所有检测器
   */
  getPlayerDetectors(seatId: number): ContinuousDetectionConfig[] {
    // 使用Array.from()避免downlevelIteration问题
    return Array.from(this.detectors.values()).filter(
      (config) => config.seatId === seatId
    );
  }

  /**
   * 清除所有检测器
   */
  clearAllDetectors(): void {
    // 使用Array.from()避免downlevelIteration问题
    Array.from(this.detectors.keys()).forEach((detectorId) => {
      this.removeDetector(detectorId);
    });
  }
}

// 导出单例
export const continuousDetectionManager = new ContinuousDetectionManager();
