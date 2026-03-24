/**
 * 占卜师干扰项管理器
 * 实现干扰项自动转移逻辑，持续检测干扰项阵营变更
 */

import { continuousDetectionManager } from "./ContinuousDetectionManager";
import { unifiedEventBus } from "./unifiedEventBus";

export interface FortuneTellerBoonConfig {
  /** 游戏ID */
  gameId: string;
  /** 当前干扰项玩家ID */
  currentBoonSeatId: number;
  /** 占卜师玩家ID */
  fortuneTellerSeatId: number;
  /** 游戏开始时间 */
  startTime: number;
  /** 干扰项历史记录 */
  history: Array<{
    seatId: number;
    startTime: number;
    endTime?: number;
    reason: string;
  }>;
}

/**
 * 占卜师干扰项管理器
 */
class FortuneTellerBoonManager {
  private boonConfigs: Map<string, FortuneTellerBoonConfig> = new Map();

  /**
   * 初始化占卜师干扰项
   */
  initializeBoon(
    gameId: string,
    fortuneTellerSeatId: number,
    initialBoonSeatId: number
  ): void {
    const config: FortuneTellerBoonConfig = {
      gameId,
      currentBoonSeatId: initialBoonSeatId,
      fortuneTellerSeatId,
      startTime: Date.now(),
      history: [
        {
          seatId: initialBoonSeatId,
          startTime: Date.now(),
          reason: "初始设置",
        },
      ],
    };

    this.boonConfigs.set(gameId, config);

    // 注册持续检测器，监听干扰项玩家的阵营变化
    this.registerBoonDetector(gameId, initialBoonSeatId);

    console.log(
      `[FortuneTellerBoonManager] 初始化占卜师干扰项: 游戏=${gameId}, 占卜师=${fortuneTellerSeatId}, 干扰项=${initialBoonSeatId}`
    );
  }

  /**
   * 注册干扰项检测器
   */
  private registerBoonDetector(gameId: string, boonSeatId: number): void {
    const detectorId = `fortune_teller_boon_${gameId}_${boonSeatId}`;

    continuousDetectionManager.registerDetector({
      detectorId,
      roleId: "fortune_teller",
      seatId: boonSeatId,
      eventTypes: [
        "player:alignment_changed",
        "player:role_changed",
        "player:died",
      ],
      condition: (payload) => {
        // 只检测当前干扰项玩家的变化
        return payload.seatId === boonSeatId;
      },
      callback: async (payload, context) => {
        await this.handleBoonChange(gameId, boonSeatId, payload, context);
      },
      persistAfterDeath: true, // 玩家死亡后仍然需要检测
    });
  }

  /**
   * 处理干扰项变化
   */
  private async handleBoonChange(
    gameId: string,
    boonSeatId: number,
    payload: any,
    _context: any
  ): Promise<void> {
    const config = this.boonConfigs.get(gameId);
    if (!config) {
      console.warn(`[FortuneTellerBoonManager] 找不到游戏配置: ${gameId}`);
      return;
    }

    // 检查干扰项玩家是否变为邪恶阵营
    const isNowEvil = this.isPlayerEvil(payload);
    if (isNowEvil) {
      console.log(
        `[FortuneTellerBoonManager] 干扰项玩家 ${boonSeatId} 变为邪恶阵营，需要重新选择干扰项`
      );

      // 记录历史
      const currentBoon = config.history.find((h) => !h.endTime);
      if (currentBoon) {
        currentBoon.endTime = Date.now();
        currentBoon.reason = "变为邪恶阵营";
      }

      // 重新选择干扰项
      const newBoonSeatId = await this.selectNewBoon(gameId, boonSeatId);

      if (newBoonSeatId !== null) {
        config.currentBoonSeatId = newBoonSeatId;
        config.history.push({
          seatId: newBoonSeatId,
          startTime: Date.now(),
          reason: "自动转移（原干扰项变为邪恶）",
        });

        // 注册新的检测器
        this.registerBoonDetector(gameId, newBoonSeatId);

        // 触发事件通知
        unifiedEventBus.emit("fortune_teller_boon_changed", {
          gameId,
          oldBoonSeatId: boonSeatId,
          newBoonSeatId,
          reason: "原干扰项变为邪恶阵营",
          timestamp: Date.now(),
        });

        console.log(
          `[FortuneTellerBoonManager] 干扰项已转移: ${boonSeatId} -> ${newBoonSeatId}`
        );
      }
    }
  }

  /**
   * 判断玩家是否变为邪恶阵营
   */
  private isPlayerEvil(payload: any): boolean {
    // 根据事件负载判断玩家是否变为邪恶
    if (payload.eventType === "player:alignment_changed") {
      return payload.newAlignment === "evil";
    }

    if (payload.eventType === "player:role_changed") {
      // 根据新角色类型判断是否为邪恶
      const evilRoleTypes = ["demon", "minion"];
      return evilRoleTypes.includes(payload.newRole?.type);
    }

    return false;
  }

  /**
   * 选择新的干扰项
   */
  private async selectNewBoon(
    _gameId: string,
    _oldBoonSeatId: number
  ): Promise<number | null> {
    // 这里需要从游戏状态中获取所有善良玩家
    // 暂时返回null，实际实现需要游戏状态信息
    console.log(
      "[FortuneTellerBoonManager] 需要从游戏状态中选择新的干扰项，但游戏状态接口未实现"
    );
    return null;
  }

  /**
   * 获取当前干扰项
   */
  getCurrentBoon(gameId: string): number | null {
    const config = this.boonConfigs.get(gameId);
    return config?.currentBoonSeatId ?? null;
  }

  /**
   * 检查玩家是否为干扰项
   */
  isPlayerBoon(gameId: string, seatId: number): boolean {
    const config = this.boonConfigs.get(gameId);
    return config?.currentBoonSeatId === seatId;
  }

  /**
   * 获取干扰项历史
   */
  getBoonHistory(
    gameId: string
  ): Array<FortuneTellerBoonConfig["history"][0]> | null {
    const config = this.boonConfigs.get(gameId);
    return config?.history ?? null;
  }

  /**
   * 移除游戏的干扰项配置
   */
  removeGameConfig(gameId: string): void {
    const config = this.boonConfigs.get(gameId);
    if (config) {
      // 移除所有检测器
      continuousDetectionManager.removePlayerDetectors(
        config.currentBoonSeatId,
        true
      );
      this.boonConfigs.delete(gameId);
      console.log(`[FortuneTellerBoonManager] 移除游戏配置: ${gameId}`);
    }
  }

  /**
   * 手动设置干扰项
   */
  setBoonManually(
    gameId: string,
    seatId: number,
    reason: string = "手动设置"
  ): void {
    const config = this.boonConfigs.get(gameId);
    if (!config) {
      console.warn(`[FortuneTellerBoonManager] 找不到游戏配置: ${gameId}`);
      return;
    }

    const oldBoonSeatId = config.currentBoonSeatId;

    // 记录历史
    const currentBoon = config.history.find((h) => !h.endTime);
    if (currentBoon) {
      currentBoon.endTime = Date.now();
      currentBoon.reason = `手动替换为 ${seatId}`;
    }

    // 移除旧检测器
    continuousDetectionManager.removePlayerDetectors(oldBoonSeatId, true);

    // 设置新干扰项
    config.currentBoonSeatId = seatId;
    config.history.push({
      seatId,
      startTime: Date.now(),
      reason,
    });

    // 注册新检测器
    this.registerBoonDetector(gameId, seatId);

    // 触发事件通知
    unifiedEventBus.emit("fortune_teller_boon_changed", {
      gameId,
      oldBoonSeatId,
      newBoonSeatId: seatId,
      reason,
      timestamp: Date.now(),
    });

    console.log(
      `[FortuneTellerBoonManager] 手动设置干扰项: ${oldBoonSeatId} -> ${seatId} (${reason})`
    );
  }
}

// 导出单例
export const fortuneTellerBoonManager = new FortuneTellerBoonManager();
