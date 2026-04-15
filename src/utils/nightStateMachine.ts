/**
 * 夜晚状态机
 * 纯函数式状态管理，严格控制夜晚流程流转，所有状态变更均为不可变
 */

import {
  baronAbility,
  butlerAbility,
  chefAbility,
  drunkAbility,
  empathAbility,
  fortuneTellerAbility,
  impAbility,
  investigatorAbility,
  librarianAbility,
  mayorAbility,
  monkAbility,
  poisonerAbility,
  ravenkeeperAbility,
  recluseAbility,
  saintAbility,
  savantAbility,
  scarletWomanAbility,
  slayerAbility,
  soldierAbility,
  spyAbility,
  undertakerAbility,
  virginAbility,
  washerwomanAbility,
} from "../roles/new_engine/abilityRegistry";
import { unifiedEventBus } from "./unifiedEventBus";

// 游戏状态快照接口（与现有系统兼容，新引擎独立定义）
export interface GameStateSnapshot {
  nightCount: number;
  seats: any[];
  statusEffects: Record<number, any[]>;
  gamePhase: string;
  [key: string]: any;
}

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
export interface NightActionNode {
  seatId: number;
  roleId: string;
  roleName: string;
  priority: number;
  isFirstNightOnly: boolean;
  abilityId: string;
  wakeMessage: string;
}

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
const MIGRATED_ABILITY_IDS = new Set([
  washerwomanAbility.abilityId,
  librarianAbility.abilityId,
  investigatorAbility.abilityId,
  chefAbility.abilityId,
  empathAbility.abilityId,
  fortuneTellerAbility.abilityId,
  ravenkeeperAbility.abilityId,
  impAbility.abilityId,
  baronAbility.abilityId,
  butlerAbility.abilityId,
  drunkAbility.abilityId,
  mayorAbility.abilityId,
  monkAbility.abilityId,
  poisonerAbility.abilityId,
  recluseAbility.abilityId,
  saintAbility.abilityId,
  savantAbility.abilityId,
  scarletWomanAbility.abilityId,
  slayerAbility.abilityId,
  soldierAbility.abilityId,
  spyAbility.abilityId,
  undertakerAbility.abilityId,
  virginAbility.abilityId,
]);

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
      let node = { ...payload.currentNode };
      // Fallback机制：未迁移角色生成空白节点
      if (!MIGRATED_ABILITY_IDS.has(node.abilityId)) {
        node = createFallbackNode(node);
      }
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
   * 重置状态机
   */
  reset(): void {
    this._currentState = NightState.IDLE;
    this._currentNode = null;
    this._nightCount = 0;
    this._isFirstNight = false;
  }
}
