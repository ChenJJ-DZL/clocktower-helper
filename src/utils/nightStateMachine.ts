/**
 * 夜晚状态机
 * 纯函数式状态管理，严格控制夜晚流程流转，所有状态变更均为不可变
 */

import type { GameStateSnapshot, NightActionNode } from "./middlewareTypes";
import { unifiedEventBus } from "./unifiedEventBus";

export type { GameStateSnapshot, NightActionNode };

// 夜晚状态枚举
export enum NightState {
  /** 空闲状态，夜晚未开始 */
  IDLE = "idle",
  /** 队列生成中，计算唤醒顺序 */
  QUEUING = "queuing",
  /** 唤醒玩家中 */
  WAKING = "waking",
  /** 处理技能行动中 */
  PROCESSING = "processing",
  /** 等待说书人确认 */
  CONFIRMING = "confirming",
  /** 黎明结算中 */
  DAWN = "dawn",
  /** 夜晚结束 */
  ENDED = "ended",
}

// 夜间行动节点接口

// 状态转移规则：允许的状态流转路径
const ALLOWED_TRANSITIONS: Record<NightState, NightState[]> = {
  [NightState.IDLE]: [NightState.QUEUING],
  [NightState.QUEUING]: [NightState.WAKING, NightState.ENDED],
  [NightState.WAKING]: [NightState.PROCESSING, NightState.DAWN],
  [NightState.PROCESSING]: [NightState.CONFIRMING, NightState.WAKING],
  [NightState.CONFIRMING]: [NightState.WAKING, NightState.DAWN],
  [NightState.DAWN]: [NightState.ENDED],
  [NightState.ENDED]: [NightState.IDLE],
};

// 已迁移的能力ID列表（从新引擎配置中获取）
// 所有能力均已迁移到新引擎，无需显式列出
const MIGRATED_ABILITY_IDS = new Set<string>();

// 状态变更事件映射
const STATE_CHANGE_EVENTS: Partial<Record<NightState, string>> = {
  [NightState.QUEUING]: "night:started",
  [NightState.WAKING]: "night:wake",
  [NightState.PROCESSING]: "ability:triggered",
  [NightState.CONFIRMING]: "prompt:generated",
  [NightState.DAWN]: "night:ended",
};

/**
 * 生成未迁移角色的Fallback节点
 */
function createFallbackNode(originalNode: NightActionNode): NightActionNode {
  return {
    ...originalNode,
    wakeMessage: `【待迁移】${originalNode.roleName}的能力尚未适配新版引擎，请点击跳过`,
  };
}

export class NightStateMachine {
  private _currentState: NightState = NightState.IDLE;
  private _currentNode: NightActionNode | null = null;
  private _stateSnapshot: Readonly<GameStateSnapshot>;
  private _nightCount: number = 0;
  private _isFirstNight: boolean = false;

  constructor(initialSnapshot: GameStateSnapshot) {
    this._stateSnapshot = Object.freeze({ ...initialSnapshot });
  }

  /** 当前状态（只读） */
  get currentState(): NightState {
    return this._currentState;
  }

  /** 当前处理的行动节点（只读） */
  get currentNode(): NightActionNode | null {
    return this._currentNode ? { ...this._currentNode } : null;
  }

  /** 当前游戏状态快照（只读，不可变） */
  get stateSnapshot(): Readonly<GameStateSnapshot> {
    return this._stateSnapshot;
  }

  /** 是否为首夜（只读） */
  get isFirstNight(): boolean {
    return this._isFirstNight;
  }

  /** 夜晚序号（只读） */
  get nightCount(): number {
    return this._nightCount;
  }

  /**
   * 尝试转移到目标状态
   * @param targetState 目标状态
   * @param payload 状态转移携带的数据
   * @returns 是否转移成功
   */
  transitionTo(targetState: NightState, payload?: any): boolean {
    // 检查状态转移是否合法
    if (!ALLOWED_TRANSITIONS[this._currentState].includes(targetState)) {
      console.error(
        `[NightStateMachine] 非法状态转移: ${this._currentState} -> ${targetState}`
      );
      return false;
    }

    const oldState = this._currentState;
    this._currentState = targetState;

    // 更新内部状态
    if (targetState === NightState.QUEUING && payload?.nightCount) {
      this._nightCount = payload.nightCount;
      this._isFirstNight = payload.nightCount === 1;
    }

    if (payload?.currentNode) {
      const node = { ...payload.currentNode };
      // Fallback机制：未迁移角色生成空白节点
      // 所有能力均已迁移到新引擎，无需fallback
      this._currentNode = node;
    }

    if (payload?.snapshot) {
      this._stateSnapshot = Object.freeze({ ...payload.snapshot });
    }

    // 触发状态变更事件
    unifiedEventBus.emit("game:phase_changed", {
      oldPhase: oldState,
      newPhase: targetState,
    });

    // 触发对应状态的业务事件
    const eventName = STATE_CHANGE_EVENTS[targetState];
    if (eventName && payload) {
      (unifiedEventBus.emit as any)(eventName, payload);
    }

    return true;
  }

  /**
   * 更新游戏状态快照（仅在IDLE状态下允许）
   * @param newSnapshot 新的游戏状态快照
   */
  updateSnapshot(newSnapshot: GameStateSnapshot): void {
    if (this._currentState === NightState.IDLE) {
      this._stateSnapshot = Object.freeze({ ...newSnapshot });
    }
  }

  /**
   * 重置状态机
   */
  reset(): void {
    this._currentState = NightState.IDLE;
    this._currentNode = null;
    this._nightCount = 0;
    this._isFirstNight = false;
  }
}
