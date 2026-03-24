/**
 * 游戏事件总线
 * 强类型发布-订阅系统，实现模块间完全解耦
 */

// 核心事件类型定义
export interface GameEventMap {
  // 夜晚生命周期事件
  "night:started": {
    nightCount: number;
    isFirstNight: boolean;
  };
  "night:wake": {
    seatId: number;
    roleId: string;
    roleName: string;
  };
  "night:action_completed": {
    seatId: number;
    roleId: string;
    actionResult: any;
  };
  "night:ended": {
    nightCount: number;
    deathCount: number;
    deadPlayerIds: number[];
  };

  // 玩家状态事件
  "player:died": {
    targetId: number;
    reason: "demon" | "execution" | "ability" | "vote";
    sourceId?: number;
    sourceRoleId?: string;
  };
  "player:poisoned": {
    targetId: number;
    sourceId: number;
    sourceRoleId: string;
    duration: string;
  };
  "player:drunk": {
    targetId: number;
    sourceId: number;
    sourceRoleId: string;
    duration: string;
  };
  "player:protected": {
    targetId: number;
    sourceId: number;
    sourceRoleId: string;
  };
  "player:revived": {
    targetId: number;
    sourceId: number;
    sourceRoleId: string;
  };
  "player:role_changed": {
    targetId: number;
    oldRoleId: string;
    newRoleId: string;
    sourceId?: number;
    sourceRoleId?: string;
  };
  "player:alignment_changed": {
    targetId: number;
    oldAlignment: "good" | "evil";
    newAlignment: "good" | "evil";
    sourceId?: number;
    sourceRoleId?: string;
  };

  // 投票与处决事件
  "vote:nomination_made": {
    nominatorId: number;
    nominatedId: number;
    voteCount: number;
    succeeded: boolean;
  };
  "execution:occurred": {
    executedId: number;
    executorId?: number;
    dayCount: number;
  };

  // 技能事件
  "ability:triggered": {
    seatId: number;
    roleId: string;
    abilityId: string;
    targets: number[];
  };
  "ability:resolved": {
    seatId: number;
    roleId: string;
    abilityId: string;
    success: boolean;
    result: any;
  };
  "ability:blocked": {
    seatId: number;
    roleId: string;
    abilityId: string;
    reason: "poisoned" | "drunk" | "protected" | "jinx";
  };

  // 提示消息事件
  "prompt:generated": {
    promptId: string;
    content: string;
    category: "system" | "role" | "ability" | "status" | "result";
    targetSeatId?: number;
  };

  // 系统事件
  "state:updated": {
    entity: string;
    id: string | number;
    changes: Record<string, any>;
  };
  "game:phase_changed": {
    oldPhase: string;
    newPhase: string;
  };
  "game:over": {
    winSide: "good" | "evil";
    reason: string;
  };

  // 占卜师干扰项事件
  fortune_teller_boon_changed: {
    gameId: string;
    oldBoonSeatId: number;
    newBoonSeatId: number;
    reason: string;
    timestamp: number;
  };
}

/**
 * 持续监听配置
 * 用于支持被动持续检测型能力（如茶艺师、流言者等）
 */
export interface ContinuousListenerConfig {
  // 监听唯一标识（用于去重和取消）
  listenerId: string;
  // 关联的角色ID
  roleId: string;
  // 关联的玩家ID
  seatId: number;
  // 监听的事件类型
  eventTypes: GameEventType[];
  // 触发条件（可选，当条件满足时才执行回调）
  condition?: (payload: any) => boolean;
  // 触发回调
  callback: (payload: any) => Promise<void> | void;
  // 是否在玩家死亡后仍然生效
  persistAfterDeath?: boolean;
  // 有效期限（可选，如只在某几个夜晚/白天有效）
  validUntil?: {
    type: "night" | "day";
    count: number;
  };
}

export type GameEventType = keyof GameEventMap;
export type GameEventPayload<T extends GameEventType> = GameEventMap[T];
export type EventCallback<T extends GameEventType> = (
  payload: GameEventPayload<T>
) => void;

class GameEventBus {
  private subscribers: Map<GameEventType, Set<EventCallback<any>>> = new Map();
  private continuousListeners: Map<string, ContinuousListenerConfig> =
    new Map();
  private currentNightCount: number = 0;
  private currentDayCount: number = 0;

  /**
   * 订阅事件
   */
  on<T extends GameEventType>(eventType: T, callback: EventCallback<T>): void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType)!.add(callback);
  }

  /**
   * 取消订阅事件
   */
  off<T extends GameEventType>(eventType: T, callback: EventCallback<T>): void {
    const callbacks = this.subscribers.get(eventType);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  /**
   * 发布事件
   */
  emit<T extends GameEventType>(
    eventType: T,
    payload: GameEventPayload<T>
  ): void {
    // 更新内部状态计数
    if (eventType === "night:started") {
      this.currentNightCount = (
        payload as GameEventPayload<"night:started">
      ).nightCount;
    } else if (
      eventType === "game:phase_changed" &&
      (payload as GameEventPayload<"game:phase_changed">).newPhase === "day"
    ) {
      this.currentDayCount++;
    }

    // 触发普通订阅
    const callbacks = this.subscribers.get(eventType);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(payload);
        } catch (error) {
          console.error(`[GameEventBus] 事件处理错误 (${eventType}):`, error);
        }
      });
    }

    // 触发持续监听器
    this.triggerContinuousListeners(eventType, payload);
  }

  /**
   * 一次性订阅事件
   */
  once<T extends GameEventType>(
    eventType: T,
    callback: EventCallback<T>
  ): void {
    const onceCallback = (payload: GameEventPayload<T>) => {
      callback(payload);
      this.off(eventType, onceCallback);
    };
    this.on(eventType, onceCallback);
  }

  /**
   * 清除指定事件的所有订阅
   */
  clear(eventType?: GameEventType): void {
    if (eventType) {
      this.subscribers.delete(eventType);
    } else {
      this.subscribers.clear();
      this.continuousListeners.clear();
      this.currentNightCount = 0;
      this.currentDayCount = 0;
    }
  }

  /**
   * 注册持续监听器
   * 用于被动持续检测型能力，如茶艺师、流言者等
   */
  addContinuousListener(config: ContinuousListenerConfig): void {
    this.continuousListeners.set(config.listenerId, config);
  }

  /**
   * 移除持续监听器
   */
  removeContinuousListener(listenerId: string): void {
    this.continuousListeners.delete(listenerId);
  }

  /**
   * 移除所有连续监听器
   */
  removeAllContinuousListeners(): void {
    // 使用Array.from()避免downlevelIteration问题
    Array.from(this.continuousListeners.entries()).forEach(
      ([id, _listener]) => {
        this.removeContinuousListener(id);
      }
    );
  }

  /**
   * 移除指定玩家的所有持续监听器
   */
  removePlayerListeners(
    seatId: number,
    includePersistAfterDeath: boolean = false
  ): void {
    // 使用Array.from()避免downlevelIteration问题
    Array.from(this.continuousListeners.entries()).forEach(([id, listener]) => {
      if (
        listener.seatId === seatId &&
        (!listener.persistAfterDeath || includePersistAfterDeath)
      ) {
        this.continuousListeners.delete(id);
      }
    });
  }

  /**
   * 触发持续监听器
   */
  private triggerContinuousListeners<T extends GameEventType>(
    eventType: T,
    payload: GameEventPayload<T>
  ): void {
    // 使用Array.from()避免downlevelIteration问题
    Array.from(this.continuousListeners.values()).forEach((listener) => {
      // 检查是否监听当前事件类型
      if (!listener.eventTypes.includes(eventType)) {
        return;
      }

      // 检查是否已过期
      if (listener.validUntil) {
        if (
          listener.validUntil.type === "night" &&
          this.currentNightCount > listener.validUntil.count
        ) {
          this.continuousListeners.delete(listener.listenerId);
          return;
        }
        if (
          listener.validUntil.type === "day" &&
          this.currentDayCount > listener.validUntil.count
        ) {
          this.continuousListeners.delete(listener.listenerId);
          return;
        }
      }

      // 检查条件是否满足
      if (listener.condition && !listener.condition(payload)) {
        return;
      }

      // 执行回调
      try {
        const result = listener.callback(payload);
        if (result instanceof Promise) {
          result.catch((error) =>
            console.error(
              `[GameEventBus] 持续监听器执行错误 (${listener.listenerId}):`,
              error
            )
          );
        }
      } catch (error) {
        console.error(
          `[GameEventBus] 持续监听器执行错误 (${listener.listenerId}):`,
          error
        );
      }
    });
  }

  /**
   * 获取所有活跃的持续监听器
   */
  getActiveContinuousListeners(): ContinuousListenerConfig[] {
    return Array.from(this.continuousListeners.values());
  }
}

// 导出单例
export const gameEventBus = new GameEventBus();
