/**
 * 新夜晚引擎外观（Facade）
 * 封装所有内部复杂度，对外提供极简的操作接口，是未来替换旧系统的唯一桥梁
 */

import type { IRoleAbility } from "../roles/core/roleAbility.types";
import {
  generateDynamicNightQueue,
  type NightOrderEntry,
  NightQueueIterator,
} from "./dynamicQueueGenerator";
import {
  type MiddlewareContext,
  runFullAbilityPipeline,
} from "./middlewarePipeline";
import {
  type GameStateSnapshot,
  type NightActionNode,
  NightState,
  NightStateMachine,
} from "./nightStateMachine";
import { renderPrompt } from "./promptEngine";

// 引擎配置
export interface NightEngineConfig {
  /** 全量夜晚顺序表 */
  fullNightOrder: NightOrderEntry[];
  /** 所有角色的技能实现映射 */
  abilityMap: Record<string, IRoleAbility>;
}

// 引擎状态
export interface NightEngineState {
  currentState: NightState;
  currentNode: NightActionNode | null;
  currentPrompt: string | null;
  queue: NightActionNode[];
  currentIndex: number;
  isNightStarted: boolean;
  isNightEnded: boolean;
}

export class NightEngine {
  private _stateMachine: NightStateMachine;
  private _queueIterator: NightQueueIterator | null = null;
  private _config: NightEngineConfig;
  private _currentAbility: IRoleAbility | null = null;
  private _lastContext: MiddlewareContext | null = null;

  constructor(initialSnapshot: GameStateSnapshot, config: NightEngineConfig) {
    this._stateMachine = new NightStateMachine(initialSnapshot);
    this._config = config;
  }

  /**
   * 获取当前引擎状态（只读）
   */
  get state(): NightEngineState {
    return {
      currentState: this._stateMachine.currentState,
      currentNode: this._stateMachine.currentNode,
      currentPrompt: this._lastContext?.meta?.prompt ?? null,
      queue: this._queueIterator?.queue ?? [],
      currentIndex: this._queueIterator?.currentIndex ?? -1,
      isNightStarted: this._stateMachine.currentState !== NightState.IDLE,
      isNightEnded: this._stateMachine.currentState === NightState.ENDED,
    };
  }

  /**
   * 开始夜晚流程
   * @param nightCount 夜晚序号（1为首夜）
   */
  startNight(nightCount: number): void {
    const isFirstNight = nightCount === 1;

    // 1. 状态转移到队列生成中
    this._stateMachine.transitionTo(NightState.QUEUING, { nightCount });

    // 2. 动态生成当前夜晚的唤醒队列
    const queue = generateDynamicNightQueue(
      this._config.fullNightOrder,
      this._stateMachine.stateSnapshot,
      {
        isFirstNight,
      }
    );

    // 3. 创建队列迭代器
    this._queueIterator = new NightQueueIterator(queue);

    // 4. 状态转移到唤醒中，开始处理第一个节点
    this._stateMachine.transitionTo(NightState.WAKING);
    this.nextAction();
  }

  /**
   * 处理下一个行动节点
   */
  nextAction(): void {
    if (!this._queueIterator) {
      throw new Error("夜晚未开始，请先调用startNight()");
    }

    // 队列已处理完毕，进入黎明阶段
    if (this._queueIterator.isEnd) {
      this._stateMachine.transitionTo(NightState.DAWN);
      this._stateMachine.transitionTo(NightState.ENDED);
      return;
    }

    // 获取下一个节点
    const nextNode = this._queueIterator.next();
    if (!nextNode) {
      this._stateMachine.transitionTo(NightState.DAWN);
      this._stateMachine.transitionTo(NightState.ENDED);
      return;
    }

    // 获取对应的技能实现
    this._currentAbility = this._config.abilityMap[nextNode.abilityId] ?? null;

    // 生成说书人提示词
    const prompt = renderPrompt(nextNode.wakeMessage ?? "wake_default", {
      roleName: nextNode.roleName,
      isFirstNight: this._stateMachine.isFirstNight,
    });

    // 状态转移到唤醒中
    this._stateMachine.transitionTo(NightState.WAKING, {
      currentNode: nextNode,
      prompt,
    });
  }

  /**
   * 提交玩家行动选择
   * @param targetIds 选择的目标玩家ID列表
   * @param storytellerInput 说书人额外输入参数
   */
  async submitAction(
    targetIds: number[],
    storytellerInput?: any
  ): Promise<GameStateSnapshot> {
    if (
      !this._queueIterator ||
      !this._stateMachine.currentNode ||
      !this._currentAbility
    ) {
      throw new Error("没有正在处理的行动节点");
    }

    const currentNode = this._stateMachine.currentNode;

    // 1. 状态转移到处理中
    this._stateMachine.transitionTo(NightState.PROCESSING, {
      targetIds,
      storytellerInput,
    });

    // 2. 构造中间件上下文
    const context: MiddlewareContext = {
      snapshot: this._stateMachine.stateSnapshot,
      actionNode: currentNode,
      targetIds,
      storytellerInput,
      meta: {},
      aborted: false,
    };

    // 3. 执行技能中间件管道
    const resultContext = await runFullAbilityPipeline(
      {
        preCheck: this._currentAbility.preCheck,
        calculate: this._currentAbility.calculate,
        stateUpdate: this._currentAbility.stateUpdate,
        postProcess: this._currentAbility.postProcess,
      },
      context
    );

    this._lastContext = resultContext;

    // 4. 处理执行结果
    if (resultContext.aborted) {
      console.log(`技能执行中止: ${resultContext.abortReason}`);
    } else {
      // 更新状态机中的快照
      this._stateMachine.transitionTo(NightState.CONFIRMING, {
        snapshot: resultContext.snapshot,
        result: resultContext.meta,
      });
    }

    return resultContext.snapshot;
  }

  /**
   * 跳过当前行动节点
   */
  skipCurrent(): void {
    if (!this._queueIterator) {
      throw new Error("夜晚未开始，请先调用startNight()");
    }

    console.log(
      `跳过节点: ${this._stateMachine.currentNode?.roleName ?? "未知"}`
    );
    this.nextAction();
  }

  /**
   * 直接结束夜晚
   */
  endNight(): void {
    this._stateMachine.transitionTo(NightState.DAWN);
    this._stateMachine.transitionTo(NightState.ENDED);
  }

  /**
   * 更新外部快照（在游戏状态变化时调用）
   * @param newSnapshot 新的游戏状态快照
   */
  updateSnapshot(newSnapshot: GameStateSnapshot): void {
    // 仅在夜晚未开始时更新快照，夜晚进行中不允许外部修改状态
    if (this._stateMachine.currentState === NightState.IDLE) {
      this._stateMachine.transitionTo(NightState.IDLE, {
        snapshot: newSnapshot,
      });
    }
  }

  /**
   * 重置引擎状态
   */
  reset(): void {
    this._stateMachine.reset();
    this._queueIterator = null;
    this._currentAbility = null;
    this._lastContext = null;
  }
}
