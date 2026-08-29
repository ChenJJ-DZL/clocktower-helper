/**
 * 动态夜晚队列生成器
 * 根据当前游戏状态动态生成真实需要唤醒的角色队列，兼容所有隐性规则
 */

import { LEGION_MUTUAL_RECOGNITION_ID } from "../roles/demon/demonFirstNightHelper";
import type { GameStateSnapshot, NightActionNode } from "./nightStateMachine";

// 全量夜晚顺序表项
export interface NightOrderEntry {
  roleId: string;
  roleName: string;
  firstNightPriority: number;
  otherNightPriority: number;
  firstNightOnly: boolean;
  wakeMessage: string;
  otherNightOnly?: boolean;
  abilityId: string;
  /** 死后仍可唤醒（如间谍查看魔典） */
  deadActorWakes?: boolean;
  /** 🔧 死亡触发型角色（守鸦人/贤者等 ON_DEATH）：仅在当晚死亡时入队 */
  deathTriggered?: boolean;
  /** 🔧 依赖"今日有玩家死于处决"才入队（送葬者）：
   *    平票平安日 / 镇长免疫处决等无人死亡场景，不应唤醒送葬者 */
  requiresExecutedToday?: boolean;
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
 * 获取座位在夜间队列中应使用的“有效角色 id”。
 * 酒鬼伪装成什么身份，就按该身份参与游戏流程（唤醒/技能/顺序）。
 */
function getEffectiveRoleId(seat: any): string | undefined {
  if (!seat?.role) return undefined;
  if (seat.role.id === "drunk" || seat.role.id === "marionette") {
    return seat.charadeRole?.id ?? seat.role.id;
  }
  return seat.role.id;
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
    // 首夜仅角色过滤（含字段缺失时的优先级兜底：other 有值但 first 为 0）
    const firstNightOnly =
      entry.firstNightOnly ||
      (entry.firstNightPriority > 0 && entry.otherNightPriority <= 0);
    const otherNightOnly =
      entry.otherNightOnly ||
      (entry.otherNightPriority > 0 && entry.firstNightPriority <= 0);

    if (isFirstNight && otherNightOnly) {
      return false;
    }

    const isSystemEvilInfo =
      entry.roleId === "minion_info" ||
      entry.roleId === "demon_info" ||
      entry.roleId === LEGION_MUTUAL_RECOGNITION_ID;
    const poppyGrowerDiedAndTriggersEvil =
      (snapshot as any).poppyGrowerDead === true;

    if (
      !isFirstNight &&
      firstNightOnly &&
      !(isSystemEvilInfo && poppyGrowerDiedAndTriggersEvil)
    ) {
      return false;
    }
    // 首夜已结束后，即使某些规则把后续夜序重置为“首夜”，
    // 首夜信息角色也绝不重复唤醒。
    if (
      firstNightOnly &&
      (snapshot as any).hasCompletedFirstNight &&
      !(isSystemEvilInfo && poppyGrowerDiedAndTriggersEvil)
    ) {
      return false;
    }

    // 罂粟种植者状态判定：
    // 在首夜，如果罂粟种植者在场且健康（存活且未中毒未醉酒），爪牙互认与军团互认步骤绝不进队列！
    const isPoppyGrowerAlive = snapshot.seats.some(
      (s) =>
        s.role?.id === "poppy_grower" &&
        !s.isDead &&
        !s.isDrunk &&
        !s.isPoisoned
    );
    // 系统信息步骤（minion_info / demon_info / legion_mutual_recognition）：找到对应玩家，不需要精确 roleId 匹配
    if (entry.roleId === "minion_info") {
      // 首夜：若罂粟种植者存活且健康，爪牙互认直接取消！
      if (isFirstNight && isPoppyGrowerAlive) {
        return false;
      }
      // 非首夜：仅在罂粟种植者刚死亡且需要进行邪恶互认时才触发
      if (!isFirstNight && !poppyGrowerDiedAndTriggersEvil) {
        return false;
      }
      const seat = snapshot.seats.find(
        (s) => s.role?.type === "minion" && (includeDead || !s.isDead)
      );
      if (!seat) return false;
      return true;
    }
    if (entry.roleId === "demon_info") {
      // 恶魔信息：
      // 首夜：恶魔总会唤醒（以获取 3 个伪装），但在罂粟种植者存活时，恶魔不能得知爪牙/同伴是谁
      // 非首夜：仅在罂粟种植者死亡触发邪恶互认时才再次唤醒
      if (!isFirstNight && !poppyGrowerDiedAndTriggersEvil) {
        return false;
      }
      const seat = snapshot.seats.find(
        (s) => s.role?.type === "demon" && (includeDead || !s.isDead)
      );
      if (!seat) return false;
      return true;
    }
    if (entry.roleId === LEGION_MUTUAL_RECOGNITION_ID) {
      // 军团互认：
      // 首夜：若罂粟种植者存活且健康，军团互认绝不进队列（军团不互认）！
      if (isFirstNight && isPoppyGrowerAlive) {
        return false;
      }
      // 非首夜：仅在罂粟种植者刚死亡且需要进行邪恶互认时才触发
      if (!isFirstNight && !poppyGrowerDiedAndTriggersEvil) {
        return false;
      }
      return snapshot.seats.some(
        (s) => s.role?.id === "legion" && (includeDead || !s.isDead)
      );
    }

    // 🔧 红唇女郎（Scarlet Woman）为纯被动角色，不在首夜或非首夜作为红唇女郎唤醒。
    //   若恶魔死亡且满足≥5人存活，她将自动变身并继承恶魔身份（在恶魔行动环节作为恶魔行动）。
    if (entry.roleId === "scarlet_woman") {
      return false;
    }

    // 找到对应的座位（默认只找存活玩家）
    // includeDead 全局覆盖 + deadActorWakes 角色级覆盖（如间谍死后仍唤醒）
    const effectiveIncludeDead = (entry as any).deadActorWakes || includeDead;
    const seat = snapshot.seats.find(
      (s) =>
        getEffectiveRoleId(s) === entry.roleId &&
        (effectiveIncludeDead || !s.isDead)
    );

    if (!seat) {
      return false;
    }

    // 🔧 死亡触发型角色（守鸦人等 ON_DEATH）：仅当该玩家今晚死亡时唤醒。
    //   此前守鸦人存活时也会被加入夜间队列（guide 显示"守鸦人，请睁眼"），
    //   与"如果你在夜晚死亡，你会被唤醒"规则不符。
    if (entry.deathTriggered) {
      const deadThisNight = (snapshot as any).deadThisNight ?? [];
      const diedThisNight = seat.isDead && deadThisNight.includes(seat.id);
      if (!diedThisNight) {
        return false;
      }
    }

    // 🔧 送葬者：仅当日有玩家死于处决时才唤醒（规则"如果当天有任何玩家死于处决，唤醒送葬者"）。
    //   平票平安日 / 镇长免疫处决（未死亡）等场景无玩家死于处决，不应唤醒。
    if (entry.requiresExecutedToday) {
      const todayExecutedId = (snapshot as any).todayExecutedId as
        | number
        | null
        | undefined;
      // 判定：快照级 todayExecutedId 对应座位必须处于死亡状态（且死于处决），
      // 或座位级 executedToday 标记 + isDead（killPlayer 处决死亡时写入 executedToday）
      const hasDeathByExecution = snapshot.seats.some(
        (s: any) =>
          s.isDead &&
          (s.executedToday === true ||
            (typeof todayExecutedId === "number" && s.id === todayExecutedId))
      );
      if (!hasDeathByExecution) {
        return false;
      }
    }

    // 自定义过滤
    if (customFilter && !customFilter(entry, seat)) {
      return false;
    }

    return true;
  });

  // 2. 按优先级排序（根据是否为第一夜选择对应的优先级）
  validEntries.sort((a, b) => {
    const priorityA = isFirstNight
      ? a.firstNightPriority
      : a.otherNightPriority;
    const priorityB = isFirstNight
      ? b.firstNightPriority
      : b.otherNightPriority;
    return priorityA - priorityB;
  });

  // 3. 转换为NightActionNode格式
  const queue: NightActionNode[] = validEntries.map((entry) => {
    // 系统信息步骤：按角色类型查找座位
    let seat: any;
    if (entry.roleId === "minion_info") {
      seat = snapshot.seats.find(
        (s) => s.role?.type === "minion" && !s.isDead
      )!;
    } else if (entry.roleId === "demon_info") {
      seat = snapshot.seats.find((s) => s.role?.type === "demon" && !s.isDead)!;
    } else if (entry.roleId === LEGION_MUTUAL_RECOGNITION_ID) {
      seat = snapshot.seats.find((s) => s.role?.id === "legion" && !s.isDead)!;
    } else {
      seat = snapshot.seats.find(
        (s) => getEffectiveRoleId(s) === entry.roleId
      )!;
    }
    const roleName =
      entry.roleId === "demon_info" && seat?.role?.name
        ? `${seat.role.name}(恶魔互认)`
        : entry.roleName;

    return {
      seatId: seat.id,
      roleId: entry.roleId,
      roleName,
      priority: isFirstNight
        ? entry.firstNightPriority
        : entry.otherNightPriority,
      isFirstNightOnly: entry.firstNightOnly,
      abilityId: entry.abilityId,
      wakeMessage: entry.wakeMessage,
      firstNightPriority: entry.firstNightPriority,
      otherNightPriority: entry.otherNightPriority,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    };
  });

  // 4. 军团互认节点打标：供 UI 与行动处理器识别（无需选择目标）
  const flagLegionMutual = queue.map((node) =>
    node.roleId === LEGION_MUTUAL_RECOGNITION_ID
      ? {
          ...node,
          roleName: "军团互认",
          meta: { ...node.meta, isLegionMutualRecognition: true },
        }
      : node
  );

  return flagLegionMutual;
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
   * 🔧 夜间中途动态插入节点（插入到当前节点之后）。
   * 用于死亡触发型角色（守鸦人 ON_DEATH）：恶魔在夜间杀死的守鸦人
   * 需要在当前行动节点之后立即插入觉醒节点。
   * @param node 要插入的夜间行动节点
   */
  insertAfterCurrent(node: NightActionNode): void {
    if (this._currentIndex >= this._queue.length - 1) {
      // 当前是最后一个节点 → 追加到队尾
      this._queue.push(node);
      return;
    }
    this._queue.splice(this._currentIndex + 1, 0, node);
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
