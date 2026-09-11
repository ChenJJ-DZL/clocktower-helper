/**
 * 动态夜晚队列生成器
 * 根据当前游戏状态动态生成真实需要唤醒的角色队列，兼容所有隐性规则
 */

import { LEGION_MUTUAL_RECOGNITION_ID } from "../roles/demon/demonFirstNightHelper";
import { EVIL_CONVERTED_NOTICE_ID } from "./nightStepIds";
import { resolveEvilTwinPair } from "./evilTwinHelper";
import type { GameStateSnapshot, NightActionNode } from "./nightStateMachine";
import { isRealMinion } from "./roleFlags";

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
  // 🏹 赏金猎人「阵营告知」步骤：首夜时把被赏金猎人转成邪恶的那名镇民排到最前，
  //    由说书人告知他"你已经属于邪恶阵营"（官方要求"在给出其他夜晚信息之前"）。
  //    没有 isEvilConverted 座位时完全不注入，避免空步骤。
  const convertedSeat: any = isFirstNight
    ? snapshot.seats.find((s) => (s as any).isEvilConverted && !s.isDead)
    : undefined;
  const order: NightOrderEntry[] = convertedSeat
    ? [
        {
          roleId: EVIL_CONVERTED_NOTICE_ID,
          roleName: "邪恶阵营告知",
          firstNightPriority: -1000, // 必须排在其他夜间信息步骤之前
          otherNightPriority: -1000,
          firstNightOnly: true,
          wakeMessage: EVIL_CONVERTED_NOTICE_ID,
          abilityId: EVIL_CONVERTED_NOTICE_ID,
        },
        ...fullNightOrder,
      ]
    : fullNightOrder;

  const validEntries = order.filter((entry) => {
    // 阵营告知步骤：仅在营转过的座位存在时保留（注入时已保证）
    if (entry.roleId === EVIL_CONVERTED_NOTICE_ID) {
      return Boolean(convertedSeat);
    }
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

    // 🧚 小精灵能力继承：若为非首夜、原本仅首夜行动的角色（如图书管理员、厨师），
    //   但场上有存活小精灵刚刚继承了该能力且当晚尚未唤醒使用过，允许进队列！
    const hasPixiePendingInheritedAbility =
      !isFirstNight &&
      firstNightOnly &&
      snapshot.seats.some(
        (s) =>
          s.role?.id === "pixie" &&
          !s.isDead &&
          ((s as any).pixieCopiedRole === entry.roleId ||
            (s as any).acquiredAbilities?.includes?.(entry.roleId)) &&
          !(s as any).pixieAbilityUsed
      );

    if (
      !isFirstNight &&
      firstNightOnly &&
      !(isSystemEvilInfo && poppyGrowerDiedAndTriggersEvil) &&
      !hasPixiePendingInheritedAbility
    ) {
      return false;
    }
    // 首夜已结束后，即使某些规则把后续夜序重置为“首夜”，
    // 首夜信息角色也绝不重复唤醒。
    if (
      firstNightOnly &&
      (snapshot as any).hasCompletedFirstNight &&
      !(isSystemEvilInfo && poppyGrowerDiedAndTriggersEvil) &&
      !hasPixiePendingInheritedAbility
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
      // 官方：「提线木偶不会在游戏的首个夜晚被唤醒以得知其他邪恶玩家都有谁。」
      // 它以为自己善良，因此不参与爪牙互认；若场上唯一的爪牙就是提线木偶，本步骤直接取消。
      const seat = snapshot.seats.find(
        (s) => isRealMinion(s) && (includeDead || !s.isDead)
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
      // 军团合并专项：如果场上恶魔全为军团且包含军团互认步骤，则所有军团统一在军团互认步骤一同唤醒并获取 3 个不在场伪装，不再生成单独的 demon_info 步骤
      const hasLegionInPlay = snapshot.seats.some(
        (s) => s.role?.id === "legion" && (includeDead || !s.isDead)
      );
      const hasLegionMutualInOrder = order.some(
        (e) => e.roleId === LEGION_MUTUAL_RECOGNITION_ID
      );
      const hasNonLegionDemon = snapshot.seats.some(
        (s) =>
          s.role?.type === "demon" &&
          s.role?.id !== "legion" &&
          (includeDead || !s.isDead)
      );

      if (hasLegionInPlay && hasLegionMutualInOrder && !hasNonLegionDemon) {
        return false;
      }

      const seat = snapshot.seats.find(
        (s) =>
          s.role?.type === "demon" &&
          (!hasLegionInPlay || hasNonLegionDemon
            ? s.role?.id !== "legion"
            : true) &&
          (includeDead || !s.isDead)
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

    // 告密者（Snitch）为纯被动角色，夜间不单独唤醒。
    // 其被动伪装直接在首夜爪牙互认（minion_info）环节向爪牙独立展示。
    if (entry.roleId === "snitch") {
      return false;
    }

    // 找到对应的座位（默认只找存活玩家）
    // includeDead 全局覆盖 + deadActorWakes 角色级覆盖（如间谍死后仍唤醒）
    const effectiveIncludeDead = (entry as any).deadActorWakes || includeDead;
    const directSeat = snapshot.seats.find(
      (s) =>
        getEffectiveRoleId(s) === entry.roleId &&
        (effectiveIncludeDead || !s.isDead)
    );

    // 🧚 小精灵能力继承：若原角色未找到（不在场或已死亡），检查是否有存活且已激活该能力的小精灵
    const pixieSeat = !directSeat
      ? snapshot.seats.find(
          (s) =>
            s.role?.id === "pixie" &&
            !s.isDead &&
            ((s as any).pixieCopiedRole === entry.roleId ||
              (s as any).acquiredAbilities?.includes?.(entry.roleId) ||
              ((s as any).pixieMadnessRoleId === entry.roleId &&
                (s as any).pixieHasAbility))
        )
      : undefined;

    const seat = directSeat || pixieSeat;

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

    // 🤹 杂耍艺人（Juggler）：仅在白天声明并使用技能后，当晚才唤醒
    if (entry.roleId === "juggler") {
      if (isFirstNight) return false;
      const hasUsed =
        seat.hasUsedDayAbility ||
        (seat as any).dayAbilityResult?.correctCount !== undefined ||
        (snapshot as any).jugglerCorrectCount !== undefined;
      if (!hasUsed) {
        return false;
      }
    }

    // 自定义过滤
    if (customFilter && !customFilter(entry, seat)) {
      return false;
    }

    return true;
  });

  // 1.5 系统步骤展开：爪牙互认按「每名真爪牙一个步骤」展开
  // 官方：所有爪牙都应在首夜得知恶魔是谁、其他爪牙是谁。
  // 电子化下不需要「同时唤醒」，但必须逐一唤醒**每一名真爪牙**——
  // 旧实现只有一个 minion_info 条目、只绑定一名行动者，场上有 2~3 名真爪牙时
  // 只有第一人能拿到信息，其余爪牙完全收不到（用户实测指出）。
  // 判定一律走唯一事实来源 isRealMinion（排除提线木偶）。
  const expandedEntries: Array<NightOrderEntry & { actorSeatId?: number }> = [];
  for (const entry of validEntries) {
    if (entry.roleId === EVIL_CONVERTED_NOTICE_ID) {
      expandedEntries.push({ ...entry, actorSeatId: convertedSeat!.id });
      continue;
    }
    if (entry.roleId === "minion_info") {
      const realMinions = snapshot.seats
        .filter((s) => isRealMinion(s) && (includeDead || !s.isDead))
        .sort((a, b) => a.id - b.id);
      // 真爪牙数为 0 时上方过滤已剔除该条目；此处兜底不再展开，避免产生无行动者的空步骤
      for (const minionSeat of realMinions) {
        expandedEntries.push({ ...entry, actorSeatId: minionSeat.id });
      }
      continue;
    }
    expandedEntries.push(entry);
  }

  // 2. 按优先级排序（根据是否为第一夜选择对应的优先级）
  //    Array.prototype.sort 是稳定排序：同为 minion_info 的多名爪牙保持座位升序
  expandedEntries.sort((a, b) => {
    const priorityA = isFirstNight
      ? a.firstNightPriority
      : a.otherNightPriority;
    const priorityB = isFirstNight
      ? b.firstNightPriority
      : b.otherNightPriority;
    return priorityA - priorityB;
  });

  // 3. 转换为NightActionNode格式
  const queue: NightActionNode[] = expandedEntries.map((entry) => {
    // 系统信息步骤：按角色类型查找座位
    let seat: any;
    if (entry.roleId === "minion_info") {
      // 展开后的每个节点都绑定自己的行动者座位（多名真爪牙各占一步），
      // 因此信息按行动者座位生成，每名爪牙都能得知恶魔与其他真爪牙。
      const pinnedSeatId = entry.actorSeatId;
      seat =
        pinnedSeatId != null
          ? snapshot.seats.find((s) => s.id === pinnedSeatId)!
          : snapshot.seats.find((s) => isRealMinion(s) && !s.isDead)!;
    } else if (entry.roleId === "demon_info") {
      seat = snapshot.seats.find((s) => s.role?.type === "demon" && !s.isDead)!;
    } else if (entry.roleId === EVIL_CONVERTED_NOTICE_ID) {
      // 行动者 = 被赏金猎人转变为邪恶的那名镇民（信息按行动者座位生成）
      seat = snapshot.seats.find((s) => s.id === entry.actorSeatId)!;
    } else if (entry.roleId === LEGION_MUTUAL_RECOGNITION_ID) {
      seat = snapshot.seats.find((s) => s.role?.id === "legion" && !s.isDead)!;
    } else {
      seat = snapshot.seats.find(
        (s) =>
          getEffectiveRoleId(s) === entry.roleId &&
          (includeDead || (entry as any).deadActorWakes || !s.isDead)
      );
      if (!seat) {
        seat = snapshot.seats.find(
          (s) =>
            s.role?.id === "pixie" &&
            !s.isDead &&
            ((s as any).pixieCopiedRole === entry.roleId ||
              (s as any).acquiredAbilities?.includes?.(entry.roleId) ||
              ((s as any).pixieMadnessRoleId === entry.roleId &&
                (s as any).pixieHasAbility))
        )!;
      }
    }

    const isPixieActor =
      seat?.role?.id === "pixie" && entry.roleId !== "pixie";

    const roleName =
      entry.roleId === "demon_info" && seat?.role?.name
        ? `${seat.role.name}(恶魔互认)`
        : isPixieActor
          ? `${entry.roleName}(小精灵)`
          : entry.roleName;

    const wakeMessage = isPixieActor
      ? `唤醒${seat.id + 1}号【小精灵】（使用【${entry.roleName}】能力）`
      : entry.wakeMessage;

    return {
      seatId: seat.id,
      roleId: entry.roleId,
      roleName,
      priority: isFirstNight
        ? entry.firstNightPriority
        : entry.otherNightPriority || entry.firstNightPriority,
      isFirstNightOnly: entry.firstNightOnly,
      abilityId: entry.abilityId,
      wakeMessage,
      firstNightPriority: entry.firstNightPriority,
      otherNightPriority: entry.otherNightPriority,
      targetIds: [],
      processed: false,
      success: false,
      meta: isPixieActor
        ? { isPixieInherited: true, originalRoleId: "pixie" }
        : {},
    };
  });

  // 4. 军团互认与军团夜间统一唤醒节点打标及文案生成
  const flagLegion = queue.map((node) => {
    if (node.roleId === LEGION_MUTUAL_RECOGNITION_ID) {
      const aliveLegions = snapshot.seats.filter(
        (s) =>
          (getEffectiveRoleId(s) === "legion" || s.role?.id === "legion") &&
          (includeDead || !s.isDead)
      );
      const seatListStr =
        aliveLegions.length > 0
          ? aliveLegions.map((s) => `${s.id + 1}号`).join("、")
          : "无";
      return {
        ...node,
        roleName: "军团互认",
        wakeMessage: `座位号：${seatListStr}。说书人同时唤醒所有的军团玩家，军团玩家互认`,
        meta: {
          ...node.meta,
          isLegionMutualRecognition: true,
          isLegionUnified: true,
          legionSeatIds: aliveLegions.map((s) => s.id),
        },
      };
    }
    if (node.roleId === "legion") {
      const aliveLegions = snapshot.seats.filter(
        (s) => getEffectiveRoleId(s) === "legion" && (includeDead || !s.isDead)
      );
      const seatListStr =
        aliveLegions.length > 0
          ? aliveLegions.map((s) => `${s.id + 1}号`).join("、")
          : "无";
      return {
        ...node,
        roleName: "军团",
        wakeMessage: `座位号：${seatListStr}。说书人同时唤醒所有的军团玩家`,
        meta: {
          ...node.meta,
          isLegionUnified: true,
          legionSeatIds: aliveLegions.map((s) => s.id),
        },
      };
    }
    return node;
  });

  // 5. 军团统一行动节点合并：确保无论场上有多少军团玩家或夜序条目，仅产出 1 个军团夜间唤醒节点
  const seenRoleIds = new Set<string>();
  const consolidatedQueue = flagLegion.filter((node) => {
    if (node.roleId === "legion") {
      if (seenRoleIds.has("legion")) {
        return false;
      }
      seenRoleIds.add("legion");
    }
    return true;
  });

  // 6. 镜像双子（Evil Twin）：首夜向对立善良双子告知"X号是镜像双子"
  // 情况 1：若善良双子在首夜本身不会被唤醒（如士兵、圣徒、管家、市长等无夜间行动角色），单独注入唤醒节点告知
  if (isFirstNight) {
    const { evilTwinSeat, goodTwinSeat } = resolveEvilTwinPair(
      snapshot.seats as any,
      snapshot.evilTwinPair
    );
    if (evilTwinSeat && goodTwinSeat) {
      const hasGoodTwinInQueue = consolidatedQueue.some(
        (n) => n.seatId === goodTwinSeat.id
      );
      if (!hasGoodTwinInQueue) {
        const evilTwinIdx = consolidatedQueue.findIndex(
          (n) => n.roleId === "evil_twin"
        );
        const insertIdx =
          evilTwinIdx !== -1 ? evilTwinIdx + 1 : consolidatedQueue.length;
        const goodTwinNode: NightActionNode = {
          seatId: goodTwinSeat.id,
          roleId: "good_twin_info",
          roleName: `${goodTwinSeat.role?.name || "善良双子"}(双子告知)`,
          priority: 38.5,
          isFirstNightOnly: true,
          abilityId: "good_twin_info",
          wakeMessage: `唤醒${goodTwinSeat.id + 1}号【${goodTwinSeat.role?.name || "对立双子"}】，告知他：${evilTwinSeat.id + 1}号是镜像双子。`,
          firstNightPriority: 38.5,
          otherNightPriority: null,
          targetIds: [],
          processed: false,
          success: false,
          meta: {
            isGoodTwinInfo: true,
            evilTwinSeatId: evilTwinSeat.id,
          },
        };
        consolidatedQueue.splice(insertIdx, 0, goodTwinNode);
      }
    }
  }

  return consolidatedQueue;
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
