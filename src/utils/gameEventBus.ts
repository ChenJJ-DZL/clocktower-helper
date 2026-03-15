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
}

export type GameEventType = keyof GameEventMap;
export type GameEventPayload<T extends GameEventType> = GameEventMap[T];
export type EventCallback<T extends GameEventType> = (
  payload: GameEventPayload<T>
) => void;

class GameEventBus {
  private subscribers: Map<GameEventType, Set<EventCallback<any>>> = new Map();

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
    }
  }
}

// 导出单例
export const gameEventBus = new GameEventBus();
