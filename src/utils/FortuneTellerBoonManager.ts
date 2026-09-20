/**
 * 占卜师干扰项管理器
 * 实现干扰项自动转移逻辑，持续检测干扰项阵营变更
 */

import { continuousDetectionManager } from "./ContinuousDetectionManager";
import { unifiedEventBus } from "./unifiedEventBus";

/**
 * ⭐ 座位快照提供者（P0-8 修复）
 *
 * 为什么需要它：`selectNewBoon` 在实现时**拿不到游戏状态**，
 * 因此被写成了 `console.log` 桩函数恒返回 `null`
 * ⇒ 干扰项一旦变邪恶，**永远无法重选**，占卜师此后每夜多报一名假恶魔。
 *
 * 正解：由**上层（React 侧）注入一个只读的座位提供者**，
 * 本管理器在被触发时同步拉取当前座位，自行挑一名**存活的善良玩家**
 * （官方：「一旦被他标记为'干扰项'的那名玩家变为邪恶阵营，
 *          说书人就需要**重新选择另一名善良玩家**」）。
 */
export type BoonSeatSnapshot = Array<{
  id: number;
  isDead?: boolean;
  role?: { id?: string; type?: string } | null;
  isEvilConverted?: boolean;
  isGoodConverted?: boolean;
  registerAsEvil?: boolean;
  registerAsGood?: boolean;
  [key: string]: any;
}>;

let boonSeatProvider: (() => BoonSeatSnapshot) | null = null;

/** 由 React 层注入座位快照提供者（每个新局都应注入一次） */
export function setBoonSeatProvider(
  provider: (() => BoonSeatSnapshot) | null
): void {
  boonSeatProvider = provider;
}

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
   *
   * ⚠️⚠️ P0-8 修复（2026-09-20）：旧实现是 `console.log` 桩函数，**恒返回 null**
   *   → 干扰项变邪恶后永不重选 → 占卜师每夜持续多报一名假恶魔，且无 UI 可改。
   *
   * 正解：从注入的座位提供者拉取当前座位，挑一名**存活的善良玩家**：
   *   · 排除旧干扰项本人（已变邪恶）
   *   · 排除已死亡玩家（官方语境是「另一名善良玩家」）
   *   · 排除阵营为邪恶者
   *   · 确定性挑选（按座位 id 升序取第一个）——避免随机导致同一局面不可复现
   *
   * 若提供者未注入 / 无可选玩家 → 返回 null，并**明确告警**（不静默）。
   */
  private async selectNewBoon(
    gameId: string,
    oldBoonSeatId: number
  ): Promise<number | null> {
    if (!boonSeatProvider) {
      console.warn(
        "[FortuneTellerBoonManager] 座位提供者未注入，无法自动重选干扰项" +
          `（gameId=${gameId}）。请调用 setBoonSeatProvider() 后重试。`
      );
      return null;
    }

    let seats: BoonSeatSnapshot;
    try {
      seats = boonSeatProvider();
    } catch (err) {
      console.error(
        "[FortuneTellerBoonManager] 座位提供者抛错，无法重选干扰项:",
        err
      );
      return null;
    }

    const candidate = seats
      .filter((s) => s.id !== oldBoonSeatId)
      .filter((s) => !s.isDead)
      .filter((s) => !this.isSeatEvil(s))
      .sort((a, b) => a.id - b.id)[0];

    if (!candidate) {
      console.warn(
        `[FortuneTellerBoonManager] 找不到可用的新干扰项（gameId=${gameId}），` +
          "干扰项保持原状，需说书人手动指定。"
      );
      return null;
    }

    return candidate.id;
  }

  /** 判定座位在结算时是否被当作邪恶（含转换与登记） */
  private isSeatEvil(seat: BoonSeatSnapshot[number]): boolean {
    if (seat.isEvilConverted) return true;
    if (seat.isGoodConverted) return false;
    if (seat.registerAsEvil === true) return true;
    if (seat.registerAsGood === true) return false;
    const t = seat.role?.type;
    return t === "demon" || t === "minion" || seat.role?.id === "legion";
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
  ): FortuneTellerBoonConfig["history"][0][] | null {
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
