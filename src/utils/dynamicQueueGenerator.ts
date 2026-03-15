/**
 * 动态夜晚队列生成器
 * 根据当前游戏状态动态生成真实需要唤醒的角色队列，兼容所有隐性规则
 */

import type { GameStateSnapshot, NightActionNode } from "./nightStateMachine";

// 全量夜晚顺序表项
export interface NightOrderEntry {
  roleId: string;
  roleName: string;
  priority: number;
  firstNightOnly: boolean;
  wakeMessage: string;
  abilityId: string;
}

// 生成队列选项
export interface QueueGenerateOptions {
  /** 是否为首夜 */
  isFirstNight: boolean;
  /** 是否包含已死亡角色（默认：false） */
  includeDead?: boolean;
  /** 自定义过滤规则 */
  customFilter?: (entry: NightOrderEntry, seat: any) => boolean;
}

/**
 * 动态生成当前夜晚的唤醒队列
 * @param fullNightOrder 全量夜晚顺序表（从nightOrderParser获取）
 * @param snapshot 当前游戏状态快照
 * @param options 生成选项
 * @returns 过滤排序后的夜间行动节点队列
 */
export function generateDynamicNightQueue(
  fullNightOrder: NightOrderEntry[],
  snapshot: GameStateSnapshot,
  options: QueueGenerateOptions
): NightActionNode[] {
  const { isFirstNight, includeDead = false, customFilter } = options;

  // 1. 过滤符合条件的角色
  const validEntries = fullNightOrder.filter((entry) => {
    // 首夜仅角色过滤
    if (!isFirstNight && entry.firstNightOnly) {
      return false;
    }

    // 找到对应的存活玩家
    const seat = snapshot.seats.find(
      (s) => s.role.id === entry.roleId && (includeDead || s.isAlive)
    );

    if (!seat) {
      return false;
    }

    // 自定义过滤
    if (customFilter && !customFilter(entry, seat)) {
      return false;
    }

    return true;
  });

  // 2. 按优先级排序
  validEntries.sort((a, b) => a.priority - b.priority);

  // 3. 转换为NightActionNode格式
  const queue: NightActionNode[] = validEntries.map((entry) => {
    const seat = snapshot.seats.find((s) => s.role.id === entry.roleId)!;
    return {
      seatId: seat.id,
      roleId: entry.roleId,
      roleName: entry.roleName,
      priority: entry.priority,
      isFirstNightOnly: entry.firstNightOnly,
      abilityId: entry.abilityId,
      wakeMessage: entry.wakeMessage,
    };
  });

  return queue;
}

/**
 * 队列迭代器，支持记录当前位置、前进、回退等操作
 */
export class NightQueueIterator {
  private _queue: NightActionNode[];
  private _currentIndex: number = -1;
  private _processedNodes: Set<string> = new Set();

  constructor(queue: NightActionNode[]) {
    this._queue = [...queue];
  }

  /** 完整队列 */
  get queue(): NightActionNode[] {
    return [...this._queue];
  }

  /** 当前索引 */
  get currentIndex(): number {
    return this._currentIndex;
  }

  /** 当前节点 */
  get currentNode(): NightActionNode | null {
    return this._queue[this._currentIndex] ?? null;
  }

  /** 队列长度 */
  get length(): number {
    return this._queue.length;
  }

  /** 是否还有下一个节点 */
  get hasNext(): boolean {
    return this._currentIndex < this._queue.length - 1;
  }

  /** 是否已结束 */
  get isEnd(): boolean {
    return this._currentIndex >= this._queue.length - 1;
  }

  /**
   * 移动到下一个节点
   * @returns 下一个节点，没有则返回null
   */
  next(): NightActionNode | null {
    if (this.hasNext) {
      this._currentIndex++;
      const node = this._queue[this._currentIndex];
      this._processedNodes.add(`${node.seatId}-${node.abilityId}`);
      return node;
    }
    return null;
  }

  /**
   * 回退到上一个节点
   * @returns 上一个节点，没有则返回null
   */
  prev(): NightActionNode | null {
    if (this._currentIndex > 0) {
      this._currentIndex--;
      return this._queue[this._currentIndex];
    }
    return null;
  }

  /**
   * 跳转到指定索引
   * @param index 目标索引
   * @returns 是否跳转成功
   */
  jumpTo(index: number): boolean {
    if (index >= 0 && index < this._queue.length) {
      this._currentIndex = index;
      return true;
    }
    return false;
  }

  /**
   * 检查节点是否已处理
   * @param node 要检查的节点
   * @returns 是否已处理
   */
  isProcessed(node: NightActionNode): boolean {
    return this._processedNodes.has(`${node.seatId}-${node.abilityId}`);
  }

  /**
   * 重置迭代器
   */
  reset(): void {
    this._currentIndex = -1;
    this._processedNodes.clear();
  }
}
