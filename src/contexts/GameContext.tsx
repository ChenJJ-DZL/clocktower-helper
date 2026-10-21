"use client";

import type React from "react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";
import type {
  GamePhase,
  LogEntry,
  Role,
  Script,
  Seat,
  WinResult,
} from "../../app/data";
import type { GameRecord, NightHintState } from "../types/game";
import type { ModalType } from "../types/modal";
import {
  createSnapshot,
  restoreSnapshot,
  SNAPSHOT_KEYS,
} from "../utils/undoSnapshot";
import { TRAVELER_MAX } from "../utils/fabledLock";
import {
  applyExileDeath,
  exileThreshold,
  isExileBlockedByDeviant,
  isExilePassed,
} from "../utils/exile";

export { createSnapshot, restoreSnapshot, SNAPSHOT_KEYS };

/**
 * VFX 触发器状态
 */
export type VfxTrigger = { seatId: number; type: "slayer" | "virgin" } | null;

/**
 * 🎫 幽灵票「单向锁存」保护
 *
 * 官方规则：每名死亡玩家**整局游戏只有一张**幽灵票，一旦用掉就永久消耗，
 * 无论再过多少个夜晚 / 白天都不能再用。
 *
 * 因此 `hasGhostVote` 是一个**单向锁存位**：`true → false` 允许（消耗），
 * `false → true` **只允许在「复活」时发生**，其余任何整表覆盖都必须被拦截。
 *
 * 为什么需要它：`seats` 是一整块被到处整体覆盖的状态（撤销/重做、白天重建、
 * 读档恢复、外来快照……），任何一次「回滚到消耗之前」的整表覆盖都会把
 * 已经用掉的幽灵票悄悄还回来。把守卫放在**唯一的状态写入咽喉**
 * （reducer 的 seats 分支）上，比在每个调用点补丁更安全。
 *
 * 判定复活：`prev.isDead === true` 且 `next.isDead !== true`。
 */
function preserveGhostVote(prevSeats: Seat[], nextSeats: Seat[]): Seat[] {
  if (!Array.isArray(nextSeats) || nextSeats.length === 0) return nextSeats;
  if (!Array.isArray(prevSeats) || prevSeats.length === 0) return nextSeats;

  let touched = false;
  const merged = nextSeats.map((next) => {
    const prev = prevSeats.find((p) => p?.id === next?.id);
    if (!prev) return next;

    // 只要之前已经「用掉了幽灵票」，就不允许任何整表覆盖把它还回来
    if (prev.hasGhostVote !== false || next.hasGhostVote !== true) return next;

    // 例外：真实的复活（死亡 → 存活）才允许重新获得幽灵票
    const revived = prev.isDead === true && next.isDead !== true;
    if (revived) return next;

    touched = true;
    return { ...next, hasGhostVote: false };
  });

  return touched ? merged : nextSeats;
}

import {
  travelerScapegoatCanSubstitute,
  travelerGunslingerCanShoot,
  travelerGunslingerEligibleTargets,
  hasTravelerRole,
} from "../utils/travelerHooks";
import { isPlayerEvil } from "../../app/gameLogic";
// ⭐ 存活判据唯一权威（禁止内联 `!x.isDead`，见 deathMarkerUnification 棘轮）
import { isSeatAlive } from "../utils/seatAlive";

/**
 * 游戏状态接口 - 单一数据源
 * 所有游戏状态都存储在这里
 */
export interface GameState {
  // 基础状态
  mounted: boolean;
  showIntroLoading: boolean;
  isPortrait: boolean;
  gameId: string; // 游戏会话唯一标识

  // 座位和游戏核心状态
  seats: Seat[];
  initialSeats: Seat[];
  victorySnapshot: Seat[]; // 游戏结束时的座位快照，用于复盘
  gamePhase: GamePhase;
  selectedScript: Script | null;
  nightCount: number;
  hasCompletedFirstNight: boolean;
  deadThisNight: number[]; // 存储玩家ID
  executedPlayerId: number | null;
  gameLogs: LogEntry[];
  winResult: WinResult;
  winReason: string | null;

  // 夜间行动队列 - 核心状态
  nightActionQueue: Seat[]; // 动态生成的夜间行动队列
  currentQueueIndex: number; // 当前队列索引
  wakeQueueIds: number[]; // 兼容旧系统的ID列表
  currentWakeIndex: number; // 兼容旧系统的索引
  selectedActionTargets: number[]; // 当前选中的行动目标

  // 夜晚提示状态
  currentHint: NightHintState;
  inspectionResult: string | null;
  inspectionResultKey: number;

  // 白天事件状态
  todayDemonVoted: boolean;
  todayMinionNominated: boolean;
  todayExecutedId: number | null;
  witchCursedId: number | null;
  witchActive: boolean;
  cerenovusTarget: {
    targetId: number;
    roleName: string;
    checkedToday?: boolean;
  } | null;
  isVortoxWorld: boolean;
  fangGuConverted: boolean;
  jugglerGuesses: Record<number, { playerId: number; roleId: string }[]>;
  evilTwinPair: { evilId: number; goodId: number } | null;
  outsiderDiedToday: boolean;
  gossipStatementToday: string;
  gossipTrueTonight: boolean;
  gossipSourceSeatId: number | null;

  // 时间状态
  startTime: Date | null;
  timer: number;

  // UI状态
  selectedRole: Role | null;
  contextMenu: { x: number; y: number; seatId: number } | null;
  showMenu: boolean;
  longPressingSeats: Set<number>;

  // 模态框及辅助显示状态
  currentModal: ModalType;
  dayAbilityForm: any;
  baronSetupCheck: any;
  ignoreBaronSetup: boolean;
  compositionError: any;
  voteInputValue: string;
  showVoteErrorToast: boolean;
  gameRecords: GameRecord[];
  mayorRedirectTarget: number | null;
  nightOrderPreview: any[];
  pendingNightQueue: Seat[] | null;
  nightQueuePreviewTitle: string;
  firstNightOrder: any[];
  pastGames: any[];
  seatNotes: Record<number, string>;
  hadesiaChoiceEnabled: boolean;
  poppyGrowerDead: boolean;
  klutzChoiceTarget: number | null;

  lastExecutedPlayerId: number | null;
  damselGuessed: boolean;
  shamanKeyword: string | null;
  shamanTriggered: boolean;
  shamanConvertTarget: number | null;
  spyDisguiseMode: "off" | "default" | "on";
  spyDisguiseProbability: number;
  pukkaPoisonQueue: { targetId: number; nightsUntilDeath: number }[];
  poChargeState: Record<number, boolean>;
  autoRedHerringInfo: string | null;
  dayAbilityLogs: any[];
  damselGuessUsedBy: number[];
  usedOnceAbilities: Record<string, number[]>;
  usedDailyAbilities: Record<string, { day: number; seats: number[] }>;
  nominationMap: Record<number, number>;
  balloonistKnownTypes: Record<number, string[]>;
  balloonistCompletedIds: number[];
  hadesiaChoices: Record<number, "live" | "die">;
  virginGuideInfo: any;
  voteRecords: any[];
  votedThisRound: number[];
  hasExecutedThisDay: boolean;
  mastermindFinalDay: { active: boolean; triggeredAtNight: number } | null;
  remainingDays: number | null;
  goonDrunkedThisNight: boolean;
  nominationRecords: { nominators: Set<number>; nominees: Set<number> };
  lastDuskExecution: number | null;
  currentDuskExecution: number | null;
  history: any[]; // 存储历史快照用于撤销
  historyIndex: number; // 🔧 Undo/Redo 指针：当前指向 history 中的位置，-1 表示无历史
  reminderTokens: Record<number, import("../../app/data").ReminderToken[]>; // 每座位提醒标记
  vfxTrigger: VfxTrigger;
  // 寓言角色（Fabled）全局配置 — 不占座位，作为对局规则生效
  activeFabled: import("../../app/data").Role[];
  // 旅行者（Traveler）— 不占玩家的 15 个座位，最多 4 名，独立于 seats
  // 位置化定长数组：长度恒为 4，null = 该座位为空
  travelers: (import("../../app/data").Role | null)[];
  /**
   * 流放（Exile）进行中投票（Round 10b）— null = 无进行中的流放投票。
   * 官方口径：门槛 = 全体玩家（含死者）一半向上取整；任何人（含死者）
   * 可提议/可表决且不消耗投票标记；一日可流放多人；不产生终局。
   * ⚠️ targetKind 区分两类目标：
   *   "traveler" —— 旅行者席位（travelers 数组索引）：流放 = 离开游戏
   *                （置 null；旅行者不占座位、不参与任何计数）；
   *   "seat"     —— 玩家座位（seats.id）：流放 = applyExileDeath 死。
   */
  exileProposedToday: {
    targetKind: "traveler" | "seat";
    targetId: number; // traveler 模式 = travelers 索引；seat 模式 = seats.id
    proposerId: number; // 提议者（可含死者；0 = 说书人代提议）
    votes: number[]; // 赞成者座位 id 数组（可含死者，去重）
  } | null;
  /**
   * 暮色（Twilight = 官方 Dusk）阶段：当前执行到第几步。
   *
   * 步骤由 `buildTwilightSteps(state.travelers, isFirstNight)` **即时推导**，
   * 不存进 state（避免 travelers 变动时步骤数组过期）；这里只存游标。
   * ⚠️ 本仓库 `dusk` 是白天提名阶段，官方 Dusk 另用 `twilight`，勿混。
   */
  twilightStepIndex: number;
  /**
   * 暮色（Twilight = 官方 Dusk）阶段：**官员 / 窃贼** 选中的投票目标。
   *
   * 官方口径（parsed_roles.json）：
   *   · 官员：「每个夜晚，你要选择除你以外的一名玩家：明天白天，他的投票算作三票。」
   *   · 窃贼：「每个夜晚，你要选择除你以外的一名玩家：明天白天他的投票会被算作负数。」
   * ⇒ 在**第 N 夜的暮色**选定，作用于**第 N 个白天**的投票结算。
   *
   * ⚠️ 为什么不用 `seat.beggarTargetId` 那种写法（`useExecutionHandlers.ts` 旧代码）：
   *    旅行者**不占 seats**，把目标挂在座位字段上 ⇒ `seats.find(role.id==="beggar")`
   *    永远为 undefined ⇒ 永不执行。本字段是**独立 state**，与 seats 解耦。
   *
   * 生命周期：进入暮色时清零 → 暮色中选择写入 → 白天投票结算时读取。
   */
  twilightVoteTargets: {
    bureaucratTargetId: number | null;
    thiefTargetId: number | null;
  };
  /**
   * 旅行者接线（批 1）：替罪羊 / 枪手 的**说书人裁决**与频次闩锁。
   *
   * ⚠️ 与 `twilightVoteTargets` 同范式：旅行者**不占 seats**，本字段是
   *    **独立 state**，与 seats 解耦；判据见 `utils/travelerHooks.ts`。
   *
   * 生命周期：
   *   · 替罪羊 —— 说书人写入 `scapegoatSubstituteForId`（默认 null = 不触发，
   *     零回归）；处决结算消费后清 null；
   *   · 枪手   —— 当天**首次**投票结算后开启窗口（`gunslingerWindowNight`），
   *     说书人选目标即射击（`gunslingerUsedNight` 每白天一次闩锁）。
   *   两者用 `nightCount` 自校验日期，无需每日手动清零。
   */
  travelerHookChoices: {
    /** 说书人裁定：替罪羊代刑的被处决者座位 id；null = 不触发（默认） */
    scapegoatSubstituteForId: number | null;
    /** 枪手：当天首次投票结算的投票人（=「刚投过票」，来自真实 voters 字段） */
    gunslingerEligibleVoterIds: number[];
    /** 说书人裁定的射击目标座位 id；null = 未射击 */
    gunslingerTargetId: number | null;
    /** 枪手射击窗口开启时的 nightCount（仅当天首次投票结算开一次） */
    gunslingerWindowNight: number | null;
    /** 枪手已射击时的 nightCount（每白天一次闩锁） */
    gunslingerUsedNight: number | null;
    /**
     * ⚖️ 法官（traveler）：官方「**每局游戏限一次**，如果其他玩家发起了提名，
     *   你可以选择让本次提名直接执行处决或让投票无效。」
     *
     * ⚠️ 频次是**整局一次**（不是每天一次）⇒ 用布尔闩锁，`RESET_GAME` 才清零。
     *   说书人「不使用能力」**不**置位 ⇒ 后续每次提名仍会再问一次。
     */
    judgeUsedThisGame: boolean;
    /**
     * 🥩 屠夫（traveler）：官方「每个白天，首次处决后，你可以**再次发起提名**。」
     *   ⇒ 该白天允许**第二次**处决。字段记录"在哪个 nightCount 用过"，
     *   每个白天各可一次（`nightCount` 自校验日期，无需每日手动清零）。
     */
    butcherExtraExecutionDay: number | null;
    /**
     * 🦴 集骨者（traveler）：官方「**每局游戏限一次**，在夜晚时*，你可以选择一名
     *   死亡的玩家：他**重新获得能力**直到下个黄昏。」
     *
     * 落地口径：
     *   · `boneCollectorUsed` —— 整局一次闩锁（`RESET_GAME` 才清零）；
     *   · `boneCollectorTargetId` —— 当前被祝福的座位；其实现在
     *     `seats[id].hasAbilityEvenDead = true`（夜间队列据此**不剔除**该死者，
     *     即"重新获得能力"）；到**下个暮色**开始时由
     *     `CLEAR_BONE_COLLECTOR_BLESSING` 撤销。
     */
    boneCollectorUsed: boolean;
    boneCollectorTargetId: number | null;
    /**
     * ☕ 咖啡师（traveler）：官方「每个夜晚，**直至下个黄昏**，由说书人二选一：
     *   1）一名玩家解除并免受醉酒和中毒影响，且会得知正确信息；
     *   2）一名玩家的能力可以生效两次。该玩家会得知是哪个效果。」
     *
     * 落地口径：
     *   · `"clear"` —— 清 `isPoisoned/isDrunk` 并给座位打 `baristaCleared`，
     *     该标记被 `computeIsPoisoned` 与 `isActorDisabledByPoisonOrDrunk`
     *     **两个权威判据**读取 ⇒「解除 + 免受 + 信息正确」全部真实生效；
     *   · `"double"` —— 打 `baristaDouble` 标记 + 日志提示说书人执行第二次
     *     （引擎没有通用的"同一能力执行两次"机制，此档为说书人助手口径）。
     */
    baristaTargetId: number | null;
    baristaEffect: "clear" | "double" | null;
    /**
     * 🌙 流莺（traveler）：官方「每个夜晚*，你要选择一名存活的玩家：如果他同意，
     *   你会得知他的角色，但是你们两个可能同时死亡。」
     *
     * 说书人主观裁决分两步：`harlotAgreed`（对方是否同意）→
     * `harlotDoomed`（是否让两人同时死亡）。
     */
    harlotTargetId: number | null;
    harlotAgreed: boolean;
    harlotDoomed: boolean;
    /**
     * 🎓 学徒（traveler）：官方「在你的**首个夜晚**，如果你是善良的，你会获得一个
     *   镇民角色的能力；如果你是邪恶的，你会获得一个爪牙角色的能力。」
     *
     * 落地口径（**诚实标注**）：说书人从候选角色（按学徒阵营过滤：善良→镇民 /
     *   邪恶→爪牙）中点选一个，本字段记录该 roleId，暮色面板据此回显并写日志。
     *   ⚠️ 本仓库的夜间派发按 `seat.role.id` **静态**解析角色能力，没有通用的
     *   "为某座位动态挂载一个能力"机制 ⇒ 本字段是**说书人助手口径**：
     *   面板给出候选与确认，具体夜间行动由说书人按该能力手动处理。
     *   （不做假实现：不假装引擎会自动按授予能力唤醒。）
     */
    apprenticeGrantedRoleId: string | null;
    /**
     * 🪑 女舍监（traveler）：官方「每个白天，你可以选择**至多三对**玩家交换座位。
     *   玩家不能离开座位私聊。」
     *
     * 落地口径（真实座位交换）：
     *   交换 `seats[a]` 与 `seats[b]` 的**内容**但**保留各自 id** ⇒
     *   "两个人换了物理座位"，因此按 `id ± 1` 计算的邻座关系确实随之改变
     *   （角色/玩家名/状态都跟着人走）。`matronSwaps` 记录本白天已交换的对，
     *   上限 3 对；新白天由 `CLEAR_MATRON_SWAPS` 清空。
     *   ⚠️ 诚实标注：**当轮已产生的投票/提名记录不会随之改写**（它们以座位 id 为键）
     *   ⇒ 换座前后若同一提名仍在进行，请由说书人重新核对。
     */
    matronSwaps: { a: number; b: number }[];
  };
  /**
   * 旅行者阵营映射（P0，2026-10-16）：key = travelers 槽位下标（0..3），
   * value = 本局说书人在落座时指定的阵营。
   *
   * ⚠️⚠️ 必须走独立 state，**禁止**改 `role.type` 或 `seatAlignment.ts` 的
   *   `GOOD_ROLE_TYPES` —— 前者是静态角色定义、后者波及所有玩家。
   *   判据唯一收口：`utils/travelerHooks.ts::isTravelerEvil`。
   *   背景：`traveler` 被硬编码进 GOOD_ROLE_TYPES ⇒ 邪恶旅行者无法表达
   *   ⇒ 替罪羊代刑对邪恶玩家永不触发（官方规则静默失效）。
   */
  travelerAlignments: { [slot: number]: "good" | "evil" };
  /**
   * 🎴 传奇角色（Fabled）说书人状态容器（2026-10-16）。
   *
   * 传奇角色**不占座位、不入夜序**（`fabledLock.ts` 已钉死），
   * 官方把它们的裁定权交给说书人 ⇒ 统一走这一个容器，
   * 由 `FabledPanel` 操作、由各消费点读取。
   */
  fabledState: {
    /** 🔮 骗人精：每局限一次，让一名**善良**玩家得知「有问题」的信息 */
    fibbinUsed: boolean;
    fibbinTargetId: number | null;
    /** 😇 天使：被庇护的新手玩家 / 对其死亡负最大责任者（「不好的事」） */
    angelProtectedSeatId: number | null;
    angelPunishedSeatId: number | null;
    /** ✊ 革命者：公开声明的一对**邻座**玩家（本局一直保持同一阵营） */
    revolutionaryPair: { a: number; b: number } | null;
    /** ✊ 革命者：每局限一次「其中一人被当作其他角色/阵营」是否已用 */
    revolutionaryDisguiseUsed: boolean;
    /** ✊ 革命者：「被当作其他」的具体内容（2026-10-20 补交互：必须指明**哪一名**玩家被当作什么） */
    revolutionaryDisguise: {
      /** 被当作其他的那名玩家（revolutionaryPair 中的一人） */
      seatId: number;
      /** 被当作的角色 id（null = 不改角色） */
      asRoleId: string | null;
      /** 被当作的阵营（null = 不改阵营） */
      asAlignment: "good" | "evil" | null;
    } | null;
    /** 🎻 小提琴手：最终表决的一对玩家 + 结果 */
    fiddlerPair: { a: number; b: number } | null;
    fiddlerWinner: "good" | "evil" | null;
    fiddlerUsed: boolean;
    /** 👑 公爵夫人：来访三人 + 当晚真实邪恶数 */
    duchessVisitIds: number[];
    duchessEvilCount: number | null;
    /** 🛡️ 哨兵：初始设置的外来者数量修正（-1 / 0 / +1） */
    sentinelOutsiderDelta: number;
    /** 🕊️ 圣洁之魂：邪恶玩家数已达「初始 + 1」上限（禁止再增邪恶） */
    spiritOfIvoryCapped: boolean;
    /** 🚣 摆渡人：游戏最后一天「所有已死亡玩家重获投票标记」是否已结算 */
    ferrymanLastDayResolved: boolean;
    /** 🧸 玩具匠：恶魔已使用过「放弃攻击」（每局至少一次） */
    toymakerAttackSkipped: boolean;
  };
  /**
   * 🥣 乞丐（traveler）投票标记账本。
   *
   * 官方原文：「你只能使用投票标记才能投票。死亡的玩家可以将他的投票标记给你，
   *   如果他这么做，你会得知他的阵营。你不会中毒和醉酒。」
   *
   * 语义：
   *   · 乞丐**自带 0 枚**标记 ⇒ 默认无法举手（他是旅行者，不占座位、
   *     也没有普通玩家那样每日恢复的投票标记）；
   *   · 死亡玩家把自己的标记给他 ⇒ `tokens + 1`，同时乞丐
   *     **得知该玩家的阵营**（记录进 `donations`，落定后不再改变）；
   *   · 乞丐每次以自己名义投票 ⇒ `tokens - 1`（标记一次性）。
   *
   * ⚠️ 「免疫中毒醉酒」在旅行者语境下**天然成立**：中毒/醉酒一律写在
   *   `seats[*].isPoisoned / isDrunk`，而旅行者不占 seats
   *   ⇒ 全仓所有毒/醉播撒路径（`roleActionHandlers` / `pukka` 等 5 处）
   *   都无法命中旅行者。该条由 `travelerHooks.test.ts` 反向断言钉死。
   */
  beggarState: {
    /** 当前可用投票标记数（每次以乞丐身份投票消耗 1） */
    tokens: number;
    /**
     * 捐赠记录：`donorSeatId` 给了标记 ⇒ 乞丐得知其阵营。
     * 每条对应一枚已收下的标记（同一座位只可捐一次）。
     */
    donations: { donorSeatId: number; knownAlignment: "good" | "evil" }[];
  };
  // 全局防窥遮罩状态
  isPrivacyShieldActive: boolean;
}

/**
 * Action类型 - 所有状态修改都通过Action
 */
export type GameAction =
  | { type: "SET_PRIVACY_SHIELD_ACTIVE"; active: boolean }
  | { type: "TOGGLE_PRIVACY_SHIELD" }
  | { type: "SET_GAME_PHASE"; phase: GamePhase }
  /** 暮色阶段：设置当前步骤游标（进入暮色时由调用方先置 0） */
  | { type: "SET_TWILIGHT_STEP"; index: number }
  /**
   * 暮色阶段：官员/窃贼选定投票目标。
   * 传 `null` = 取消选择（该角色当晚不发动）。
   */
  | {
      type: "SET_TWILIGHT_VOTE_TARGET";
      role: "bureaucrat" | "thief";
      targetId: number | null;
    }
  /**
   * 清空暮色投票目标。
   * ⚠️ 必须在**进入暮色时**调用：否则上一夜的目标会残留到本夜，
   *    即使本夜该旅行者取消发动，白天投票仍会被错误加成/扣减。
   */
  | { type: "CLEAR_TWILIGHT_VOTE_TARGETS" }
  // ── 旅行者接线（批 1）：替罪羊 / 枪手 ────────────────────────────
  /**
   * 说书人裁定：替罪羊代刑目标（= 被处决者座位 id）。
   * 传 `null` = 不触发（默认）。reducer 内以纯函数判据把关。
   */
  | { type: "SET_SCAPEGOAT_SUBSTITUTE"; targetId: number | null }
  /**
   * 枪手：当天**首次**投票结算后开启射击窗口（记录「刚投过票」名单）。
   * 同一 nightCount 只允许开一次（reducer 把关）。
   */
  | { type: "OPEN_GUNSLINGER_WINDOW"; voterIds: number[]; night: number }
  /**
   * 说书人裁定：枪手射击目标（座位 id）。写入即射击（消费点走 killPlayer
   * 统一死亡入口），reducer 内以纯函数判据把关 + 打「每白天一次」闩锁。
   */
  | { type: "FIRE_GUNSLINGER"; targetId: number; night: number }
  /**
   * ⚖️ 法官（traveler）行使能力（每局限一次）。
   * `outcome` 只用于日志语义，状态效果相同：整局闩锁置位。
   *   · `"execute"` —— 本次提名直接执行处决；
   *   · `"void"`    —— 本次提名投票无效。
   */
  | { type: "MARK_JUDGE_USED"; outcome: "execute" | "void" }
  /**
   * 🥩 屠夫（traveler）：本白天使用「首次处决后再提名」⇒ 允许第二次处决。
   * 幂等：同一 `night` 只记一次；屠夫不在场则 no-op。
   */
  | { type: "MARK_BUTCHER_EXTRA_EXECUTION"; night: number }
  /**
   * 🦴 集骨者（traveler）：祝福一名**已死亡**玩家 —— 他重新获得能力直到下个黄昏。
   * reducer 校验：集骨者在场 + 整局未用过 + 目标存在且已死亡。
   */
  | { type: "BONE_COLLECTOR_BLESS"; seatId: number }
  /** 🦴 集骨者：撤销祝福（下个暮色开始时调用 ⇒ 官方「直到下个黄昏」） */
  | { type: "CLEAR_BONE_COLLECTOR_BLESSING" }
  /**
   * ☕ 咖啡师（traveler）：说书人为一名玩家二选一 —— `clear` 解除并免疫中毒/醉酒
   * （信息正确） / `double` 能力可生效两次。
   */
  | { type: "SET_BARISTA_EFFECT"; targetId: number; effect: "clear" | "double" }
  /** ☕ 咖啡师：撤销效果（下个暮色开始时调用） */
  | { type: "CLEAR_BARISTA_EFFECT" }
  /**
   * 🌙 流莺（traveler）：说书人裁定 —— `agreed` 对方是否同意（同意后得知其角色）；
   * `doomed` 是否让两人同时死亡。传 `targetId` 即选定目标。
   */
  | {
      type: "SET_HARLOT_OUTCOME";
      targetId: number | null;
      agreed?: boolean;
      doomed?: boolean;
    }
  /**
   * 🎓 学徒（traveler）：首个夜晚由说书人选定被授予的角色（善良→镇民 / 邪恶→爪牙）。
   * 传 `null` = 清除选择。
   */
  | { type: "SET_APPRENTICE_ROLE"; roleId: string | null }
  /**
   * 🪑 女舍监（traveler）：交换两名玩家的座位（内容互换、id 保留）。
   * reducer 校验：女舍监在场 + 两个座位都存在且不同 + 本白天尚未超过 **3 对**。
   */
  | { type: "MATRON_SWAP"; a: number; b: number }
  /** 🪑 女舍监：新白天清空本日换座记录（每白天上限 3 对） */
  | { type: "CLEAR_MATRON_SWAPS" }
  /**
   * 🎴 传奇角色：统一的「部分更新」入口（说书人裁定）。
   * 各字段语义见 `GameState.fabledState`。传 `null` 显式清除可选字段。
   */
  | { type: "SET_FABLED_STATE"; updates: Partial<GameState["fabledState"]> }
  /**
   * 🚣 摆渡人：游戏**最后一天**结算 —— 所有已死亡玩家重新获得投票标记。
   *
   * ⚠️ 这是官方规则对「幽灵票单向锁存」的**合法豁免**：本 action 直接写
   *   `hasGhostVote = true`，**刻意不走** `preserveGhostVote`（后者用于拦截
   *   撤销/读档等**意外**回滚，不是拦截官方规则）。
   */
  | { type: "FERRYMAN_LAST_DAY" }
  | { type: "FABLED_SWAP_ROLE"; seatId: number; role: Role }
  | { type: "FABLED_FIBBIN_MISINFO"; seatId: number }
  /**
   * 旅行者槽位离场（死亡/被流放）：把 `travelers[index]` 置 null。
   * 旅行者不占 seats ⇒ 其"死亡"的唯一表达就是槽位置空。
   * 替罪羊代刑、枪手射中旅行者等场景使用。
   */
  | { type: "EXECUTE_TRAVELER_SLOT"; index: number }
  /**
   * 旅行者阵营指定（落座时说书人逐个选择，官方：旅行者可善良可邪恶）。
   * value 传 null = 清除该槽位指定（回到默认善良）。
   */
  | {
      type: "SET_TRAVELER_ALIGNMENT";
      slot: number;
      alignment: "good" | "evil" | null;
    }
  /**
   * 🥣 乞丐：某名**死亡玩家**把自己的投票标记给乞丐。
   * reducer 校验（全部满足才写入）：
   *   1. 场上有乞丐（`travelers` 槽位非 null 且 id 为 `beggar`）；
   *   2. 捐赠者是**座位**（旅行者之间不互赠）、存在、已死亡；
   *   3. 捐赠者仍有幽灵票（`hasGhostVote !== false`）—— 给标记即消耗；
   *   4. 该座位未捐过（`donations` 去重，一人一枚）。
   * 写入效果：`tokens + 1`，并追加 `{donorSeatId, alignment}`（乞丐得知阵营）。
   */
  | { type: "GIVE_BEGGAR_TOKEN"; donorSeatId: number }
  /**
   * 🥣 乞丐：以自己名义投票 ⇒ 消耗 1 枚投票标记。
   * 无标记时 reduce 为 no-op（不产生负数）。
   */
  | { type: "CONSUME_BEGGAR_TOKEN" }
  | { type: "SET_NIGHT_ACTION_QUEUE"; queue: Seat[] }
  | { type: "NEXT_NIGHT_ACTION" }
  | { type: "PREV_NIGHT_ACTION" }
  | { type: "SET_CURRENT_QUEUE_INDEX"; index: number }
  | { type: "SET_SELECTED_TARGETS"; targets: number[] }
  | { type: "SET_SEATS"; seats: Seat[] }
  | { type: "UPDATE_SEATS"; updater: (prev: Seat[]) => Seat[] }
  | { type: "UPDATE_SEAT"; seatId: number; updates: Partial<Seat> }
  | { type: "INCREMENT_NIGHT_COUNT" }
  | { type: "SET_DEAD_THIS_NIGHT"; deadIds: number[] }
  | { type: "ADD_DEAD_THIS_NIGHT"; deadId: number }
  | { type: "SET_EXECUTED_PLAYER"; playerId: number | null }
  | { type: "ADD_LOG"; log: LogEntry }
  | { type: "SET_WIN_RESULT"; result: WinResult; reason: string | null }
  | { type: "SET_CURRENT_HINT"; hint: NightHintState }
  | { type: "SET_INSPECTION_RESULT"; result: string | null }
  | { type: "CLEAR_NIGHT_STATE" }
  | { type: "START_NIGHT"; queue: Seat[]; isFirst: boolean }
  | { type: "RESET_GAME" }
  | { type: "FILTER_DEAD_FROM_QUEUE" } // 从队列中移除已死亡且无能力的角色
  | { type: "SET_HISTORY"; history: any[] } // 设置历史记录
  | { type: "UPDATE_STATE"; updates: Partial<GameState> } // 通用更新Action
  | { type: "SET_OUTSIDER_DIED_TODAY"; died: boolean }
  /**
   * 🔴 2026-10-22：三个字段改为**可选**（局部更新）。
   *
   * 旧实现三个 setter 各带全量三字段，而三者都从**同一次渲染的 `state`** 读另外两项
   * ⇒ 连续 dispatch 时后一次用**陈旧值**覆盖前一次：
   *   实测 `setGossipStatementToday("…")` → `setGossipSourceSeatId(6)` → `setGossipTrueTonight(true)`
   *   之后快照变成 `{statement:"", isTrue:true, sourceId:null}` —— 只有最后一次落地。
   *   后果：造谣者夜间结算永远读到空声明 ⇒ 一律判「声明错误」，「为真」永远不产生死亡。
   * 改为局部更新后，每个 setter 只写自己那一个字段，天然无竞态。
   */
  | {
      type: "SET_GOSSIP_STATE";
      statement?: string;
      isTrue?: boolean;
      sourceId?: number | null;
    }
  | { type: "SET_MODAL"; modal: ModalType }
  | { type: "SET_VOTE_INPUT"; value: string }
  | { type: "UPDATE_VOTED_THIS_ROUND"; voterId: number; remove?: boolean }
  | { type: "SET_HAS_EXECUTED_THIS_DAY"; hasExecuted: boolean }
  | {
      type: "SET_NOMINATION_RECORDS";
      records: { nominators: Set<number>; nominees: Set<number> };
    }
  | { type: "SET_DUSK_EXECUTION"; last: number | null; current: number | null }
  | { type: "SET_TIMER"; timer: number }
  | { type: "SET_START_TIME"; time: Date | null }
  | { type: "SET_GAME_RECORDS"; records: GameRecord[] }
  | { type: "UPDATE_USED_ONCE_ABILITIES"; roleId: string; seatId: number }
  | {
      type: "UPDATE_PUKKA_QUEUE";
      queue: { targetId: number; nightsUntilDeath: number }[];
    }
  | { type: "SET_VFX_TRIGGER"; trigger: VfxTrigger }
  | { type: "DECLARE_MAYOR_WIN" }
  | { type: "SET_ACTIVE_FABLED"; fabled: Role[] }
  | { type: "TOGGLE_FABLED"; role: Role }
  // ── 流放（Exile · Round 10b）─────────────────────────────────────
  | {
      type: "PROPOSE_EXILE";
      targetKind: "traveler" | "seat";
      targetId: number;
      proposerId: number;
    }
  | { type: "CAST_EXILE_VOTE"; voterId: number }
  | {
      type: "RESOLVE_EXILE";
      /**
       * 说书人主观判定：目标是怪咖（Deviant）且「表现得有趣」
       * ⇒ 官方豁免，当日不可被流放。默认 false。
       */
      deviantAmusing?: boolean;
    }
  | { type: "CANCEL_EXILE" }
  | { type: "SAVE_HISTORY"; overrideState?: Partial<GameState> };
// ... 可以继续添加更多Action

/**
 * GameReducer - 统一处理所有状态更新
 */
/** 导出以便测试（相位推进 / dusk→night 契约验证） */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "SAVE_HISTORY": {
      const baseState = action.overrideState
        ? { ...state, ...action.overrideState }
        : state;
      const snapshot = createSnapshot(baseState);
      let newHistory: any[];
      let newIndex: number;

      if (state.history.length === 0 || state.historyIndex === -1) {
        newHistory = [snapshot];
        newIndex = 0;
      } else {
        const truncated = state.history.slice(0, state.historyIndex + 1);
        newHistory = [...truncated, snapshot].slice(-300);
        newIndex = newHistory.length - 1;
      }

      return {
        ...state,
        ...(action.overrideState || {}),
        history: newHistory,
        historyIndex: newIndex,
      };
    }

    case "SET_PRIVACY_SHIELD_ACTIVE":
      return { ...state, isPrivacyShieldActive: action.active };

    case "TOGGLE_PRIVACY_SHIELD":
      return { ...state, isPrivacyShieldActive: !state.isPrivacyShieldActive };

    case "SET_GAME_PHASE":
      if (typeof window !== "undefined" && action.phase !== state.gamePhase) {
        console.log(
          `[REDUCER] SET_GAME_PHASE: ${state.gamePhase} -> ${action.phase}`
        );
      }
      return { ...state, gamePhase: action.phase };

    case "SET_TWILIGHT_STEP":
      return { ...state, twilightStepIndex: Math.max(0, action.index) };

    case "SET_TWILIGHT_VOTE_TARGET": {
      // ⚠️ `action.role` 是 "bureaucrat"/"thief"，而 state 字段名是
      //    `bureaucratTargetId`/`thiefTargetId` —— 直接 `[action.role]` 会写进
      //    错误键名、让字段永远为 null（2026-10-13 实测踩到，由
      //    `twilight_vote_effects.test.ts` ② 抓到）。必须显式映射。
      const key =
        action.role === "bureaucrat"
          ? "bureaucratTargetId"
          : "thiefTargetId";
      return {
        ...state,
        twilightVoteTargets: {
          ...state.twilightVoteTargets,
          [key]: action.targetId,
        },
      };
    }

    case "CLEAR_TWILIGHT_VOTE_TARGETS":
      // 引用相等优化：本来就没有目标时返回原 state，避免无谓重渲染
      if (
        state.twilightVoteTargets.bureaucratTargetId === null &&
        state.twilightVoteTargets.thiefTargetId === null
      ) {
        return state;
      }
      return {
        ...state,
        twilightVoteTargets: { bureaucratTargetId: null, thiefTargetId: null },
      };

    // ── 旅行者接线（批 1）：替罪羊 / 枪手 ────────────────────────────
    // 判据层：utils/travelerHooks.ts（纯函数，旅行者以 state.travelers 为准）
    case "SET_SCAPEGOAT_SUBSTITUTE": {
      const current = state.travelerHookChoices;
      if (action.targetId === null) {
        if (current.scapegoatSubstituteForId === null) return state;
        return {
          ...state,
          travelerHookChoices: {
            ...current,
            scapegoatSubstituteForId: null,
          },
        };
      }
      // 判据把关：替罪羊存活（travelers 槽位非 null）且与被处决者同阵营。
      // 不满足则写入无效（保持 null = 不触发，零回归）。
      const nominatedSeat =
        state.seats.find((s) => s.id === action.targetId) ?? null;
      const candidate = travelerScapegoatCanSubstitute(
        state.travelers,
        nominatedSeat,
        state.travelerAlignments
      );
      if (!candidate) return state;
      return {
        ...state,
        travelerHookChoices: {
          ...current,
          scapegoatSubstituteForId: action.targetId,
        },
      };
    }

    case "OPEN_GUNSLINGER_WINDOW": {
      const current = state.travelerHookChoices;
      // 「当天首次投票结算后」才开窗：同一 nightCount 只开一次；
      // 当天已射击（每白天一次）也不再开。
      if (
        current.gunslingerWindowNight === action.night ||
        current.gunslingerUsedNight === action.night
      ) {
        return state;
      }
      // 「刚投过票」= 本次投票结算的真实投票人名单（宿主从 voters 字段传入）
      const eligible = travelerGunslingerEligibleTargets(
        state.travelers,
        action.voterIds
      );
      return {
        ...state,
        travelerHookChoices: {
          ...current,
          gunslingerEligibleVoterIds: eligible,
          gunslingerWindowNight: action.night,
        },
      };
    }

    case "FIRE_GUNSLINGER": {
      const current = state.travelerHookChoices;
      // 频次闩锁：每个白天一次（nightCount 自校验日期）
      if (current.gunslingerUsedNight === action.night) return state;
      // 判据把关：枪手存活（travelers 槽位非 null）且目标属于「刚投过票」名单
      if (
        !travelerGunslingerCanShoot(
          state.travelers,
          current.gunslingerEligibleVoterIds,
          action.targetId
        )
      ) {
        return state;
      }
      return {
        ...state,
        travelerHookChoices: {
          ...current,
          gunslingerTargetId: action.targetId,
          gunslingerUsedNight: action.night,
          gunslingerEligibleVoterIds: [],
        },
      };
    }

    // ── ⚖️ 法官（traveler）：每局限一次改写本次提名的结局 ──────────────
    case "MARK_JUDGE_USED": {
      const current = state.travelerHookChoices;
      // 频次闩锁：整局一次（已用过 ⇒ 幂等 no-op）
      if (current.judgeUsedThisGame) return state;
      // 判据把关：法官必须在场（旅行者槽位非 null，不读 seats）
      if (!hasTravelerRole(state.travelers, "judge")) return state;
      return {
        ...state,
        travelerHookChoices: {
          ...current,
          judgeUsedThisGame: true,
        },
      };
    }

    // ── 🥩 屠夫（traveler）：首次处决后的第二次提名/处决 ───────────────
    case "MARK_BUTCHER_EXTRA_EXECUTION": {
      const current = state.travelerHookChoices;
      // 判据把关：屠夫必须在场（旅行者槽位非 null，不读 seats）
      if (!hasTravelerRole(state.travelers, "butcher")) return state;
      // 每个白天一次：已记过同一 night ⇒ 幂等 no-op
      if (current.butcherExtraExecutionDay === action.night) return state;
      return {
        ...state,
        travelerHookChoices: {
          ...current,
          butcherExtraExecutionDay: action.night,
        },
      };
    }

    // ── 🦴 集骨者（traveler）：死者重新获得能力直到下个黄昏 ──────────────
    case "BONE_COLLECTOR_BLESS": {
      const current = state.travelerHookChoices;
      // 判据① 集骨者必须在场
      if (!hasTravelerRole(state.travelers, "bone_collector")) return state;
      // 判据② 每局游戏限一次
      if (current.boneCollectorUsed) return state;
      // 判据③ 目标存在且**已死亡**（官方：选择一名死亡的玩家）
      const target = state.seats.find((x) => x.id === action.seatId);
      // ⚠️ 官方「选择一名**死亡的**玩家」⇒ 存活者一律拒绝
      if (!target || isSeatAlive(target)) return state;
      return {
        ...state,
        seats: state.seats.map((x) =>
          x.id === action.seatId
            ? ({ ...x, hasAbilityEvenDead: true } as Seat)
            : x
        ),
        travelerHookChoices: {
          ...current,
          boneCollectorUsed: true,
          boneCollectorTargetId: action.seatId,
        },
      };
    }

    case "CLEAR_BONE_COLLECTOR_BLESSING": {
      const current = state.travelerHookChoices;
      const tid = current.boneCollectorTargetId;
      // 无祝福在身 ⇒ no-op
      if (tid === null) return state;
      // ⚠️ used 闩锁**不清**（每局一次）；只撤销"重新获得能力"这个临时效果
      return {
        ...state,
        seats: state.seats.map((x) =>
          x.id === tid ? ({ ...x, hasAbilityEvenDead: false } as Seat) : x
        ),
        travelerHookChoices: { ...current, boneCollectorTargetId: null },
      };
    }

    // ── ☕ 咖啡师（traveler）：解除并免疫中毒醉酒 / 能力两次 ────────────
    case "SET_BARISTA_EFFECT": {
      if (!hasTravelerRole(state.travelers, "barista")) return state;
      const target = state.seats.find((x) => x.id === action.targetId);
      if (!target) return state;
      const current = state.travelerHookChoices;
      if (action.effect === "clear") {
        // 「解除并**免受**醉酒和中毒影响，且会得知正确信息」
        // ⚠️ `baristaCleared` 被 computeIsPoisoned / isActorDisabledByPoisonOrDrunk
        //   两个权威判据读取 ⇒ 免疫是真实的，不只是清一次状态。
        return {
          ...state,
          seats: state.seats.map((x) =>
            x.id === action.targetId
              ? ({
                  ...x,
                  isPoisoned: false,
                  isDrunk: false,
                  baristaCleared: true,
                } as Seat)
              : x
          ),
          travelerHookChoices: {
            ...current,
            baristaTargetId: action.targetId,
            baristaEffect: "clear",
          },
        };
      }
      return {
        ...state,
        seats: state.seats.map((x) =>
          x.id === action.targetId
            ? ({ ...x, baristaDouble: true } as Seat)
            : x
        ),
        travelerHookChoices: {
          ...current,
          baristaTargetId: action.targetId,
          baristaEffect: "double",
        },
      };
    }

    case "CLEAR_BARISTA_EFFECT": {
      const current = state.travelerHookChoices;
      const tid = current.baristaTargetId;
      if (tid === null) return state;
      return {
        ...state,
        seats: state.seats.map((x) =>
          x.id === tid
            ? ({
                ...x,
                baristaCleared: false,
                baristaDouble: false,
              } as Seat)
            : x
        ),
        travelerHookChoices: {
          ...current,
          baristaTargetId: null,
          baristaEffect: null,
        },
      };
    }

    // ── 🌙 流莺（traveler）：同意后得知角色，两人可能同死 ────────────────
    case "SET_HARLOT_OUTCOME": {
      if (!hasTravelerRole(state.travelers, "harlot")) return state;
      const current = state.travelerHookChoices;
      return {
        ...state,
        travelerHookChoices: {
          ...current,
          harlotTargetId: action.targetId,
          harlotAgreed: action.agreed ?? current.harlotAgreed,
          harlotDoomed: action.doomed ?? current.harlotDoomed,
        },
      };
    }

    // ── 🎓 学徒（traveler）：首个夜晚获得一个能力 ───────────────────────
    case "SET_APPRENTICE_ROLE": {
      if (!hasTravelerRole(state.travelers, "apprentice")) return state;
      const current = state.travelerHookChoices;
      if (
        action.roleId !== null &&
        current.apprenticeGrantedRoleId === action.roleId
      ) {
        // 重复点同一角色 ⇒ 视为取消（可反悔）
        return {
          ...state,
          travelerHookChoices: { ...current, apprenticeGrantedRoleId: null },
        };
      }
      return {
        ...state,
        travelerHookChoices: {
          ...current,
          apprenticeGrantedRoleId: action.roleId,
        },
      };
    }

    // ── 🪑 女舍监（traveler）：每个白天最多三对座位交换 ─────────────────
    case "MATRON_SWAP": {
      if (!hasTravelerRole(state.travelers, "matron")) return state;
      const { a, b } = action;
      if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) return state;
      const seatA = state.seats.find((x) => x.id === a);
      const seatB = state.seats.find((x) => x.id === b);
      if (!seatA || !seatB) return state;
      const swaps = state.travelerHookChoices.matronSwaps ?? [];
      // 官方「至多三对」
      if (swaps.length >= 3) return state;
      // 交换**内容**但保留各自 id（= 两个人换了物理座位）
      const nextSeats = state.seats.map((x) => {
        if (x.id === a) return { ...seatB, id: a };
        if (x.id === b) return { ...seatA, id: b };
        return x;
      });
      return {
        ...state,
        seats: nextSeats,
        travelerHookChoices: {
          ...state.travelerHookChoices,
          matronSwaps: [...swaps, { a, b }],
        },
      };
    }

    case "CLEAR_MATRON_SWAPS": {
      const swaps = state.travelerHookChoices.matronSwaps ?? [];
      if (swaps.length === 0) return state;
      return {
        ...state,
        travelerHookChoices: { ...state.travelerHookChoices, matronSwaps: [] },
      };
    }

    // ── 🎴 传奇角色（Fabled）：说书人裁定状态 ───────────────────────────
    case "SET_FABLED_STATE": {
      const prev = state.fabledState;
      return {
        ...state,
        fabledState: { ...prev, ...action.updates },
      };
    }

    // ── 🚣 摆渡人：最后一天，所有已死亡玩家重新获得投票标记 ──────────────
    case "FERRYMAN_LAST_DAY": {
      // 判据：摆渡人必须在场（传奇角色，读 activeFabled，不读 seats）
      const hasFerryman = (state.activeFabled ?? []).some(
        (r: Role) => r.id === "ferryman"
      );
      if (!hasFerryman) return state;
      if (state.fabledState.ferrymanLastDayResolved) return state;
      return {
        ...state,
        seats: state.seats.map((x) =>
          x.isDead ? ({ ...x, hasGhostVote: true } as Seat) : x
        ),
        fabledState: { ...state.fabledState, ferrymanLastDayResolved: true },
      };
    }

    case "FABLED_SWAP_ROLE": {
      // 哨兵（Sentinel）官方："在初始设置时，可能会额外增加或减少一个外来者。"
      // 真实效果：把指定座位的角色换成同剧本的另一角色（镇民↔外来者），内容换、id 保留。
      const target = state.seats.find((x) => x.id === action.seatId);
      if (!target || !action.role) return state;
      return {
        ...state,
        seats: state.seats.map((x) =>
          x.id === action.seatId
            ? ({
                ...x,
                role: action.role,
                charadeRole: null,
                displayRole: null,
              } as Seat)
            : x
        ),
      };
    }

    case "FABLED_FIBBIN_MISINFO": {
      // 骗人精（Fibbin）官方："每局游戏限一次，一名善良玩家可能会得知'有问题'的信息。"
      // 真实效果：给目标座位打 fibbin_misinfo 状态 ⇒ 其后续信息被假信息判据消费。
      return {
        ...state,
        seats: state.seats.map((x) =>
          x.id === action.seatId
            ? ({
                ...x,
                statusEffects: [
                  ...((x as any).statusEffects ?? []),
                  { type: "fibbin_misinfo" },
                ],
              } as Seat)
            : x
        ),
        fabledState: { ...state.fabledState, fibbinUsed: true, fibbinTargetId: action.seatId },
      };
    }

    case "EXECUTE_TRAVELER_SLOT": {      const i = action.index;
      if (!Array.isArray(state.travelers)) return state;
      if (i < 0 || i >= state.travelers.length) return state;
      if (state.travelers[i] === null) return state;
      const next = [...state.travelers];
      next[i] = null;
      return { ...state, travelers: next };
    }

    case "SET_TRAVELER_ALIGNMENT": {
      const slot = action.slot;
      if (!Number.isInteger(slot) || slot < 0 || slot >= TRAVELER_MAX) {
        return state;
      }
      const prev = state.travelerAlignments ?? {};
      const nextAlign: { [k: number]: "good" | "evil" } = { ...prev };
      if (action.alignment === null) {
        delete nextAlign[slot];
      } else {
        nextAlign[slot] = action.alignment;
      }
      return { ...state, travelerAlignments: nextAlign };
    }

    // ── 🥣 乞丐：投票标记账本 ─────────────────────────────────────────
    case "GIVE_BEGGAR_TOKEN": {
      // ① 乞丐必须在场（旅行者槽位非 null、id 为 beggar）
      if (!hasTravelerRole(state.travelers, "beggar")) return state;
      // ② 捐赠者必须是**座位**且已死亡（官方：死亡的玩家可以给你投票标记）
      const donor = state.seats.find((s) => s.id === action.donorSeatId);
      // ⚠️ 官方「**死亡的**玩家可以将他的投票标记给你」⇒ 存活者不能赠予
      if (!donor || isSeatAlive(donor)) return state;
      // ③ 捐赠者仍有幽灵票（给标记 = 消耗掉他唯一的那张）
      if ((donor as any).hasGhostVote === false) return state;
      const ledger = state.beggarState ?? { tokens: 0, donations: [] };
      // ④ 同一座位只可捐一次
      if (ledger.donations.some((d) => d.donorSeatId === action.donorSeatId)) {
        return state;
      }
      const alignment: "good" | "evil" = isPlayerEvil(donor as any)
        ? "evil"
        : "good";
      // 捐赠 = 消耗该死者的标记（官方：死亡的玩家**把**他的投票标记给你）
      // ⚠️ `hasGhostVote` 是单向锁存位；true → false 本就被允许，
      //    这里显式置 false 并仍过一遍 preserveGhostVote 保持唯一写入咽喉原则。
      const nextSeats = state.seats.map((s) =>
        s.id === action.donorSeatId ? { ...s, hasGhostVote: false } : s
      );
      return {
        ...state,
        seats: preserveGhostVote(state.seats, nextSeats),
        beggarState: {
          tokens: ledger.tokens + 1,
          donations: [
            ...ledger.donations,
            { donorSeatId: action.donorSeatId, knownAlignment: alignment },
          ],
        },
      };
    }

    case "CONSUME_BEGGAR_TOKEN": {
      const ledger = state.beggarState ?? { tokens: 0, donations: [] };
      if (ledger.tokens <= 0) return state;
      return {
        ...state,
        beggarState: { ...ledger, tokens: ledger.tokens - 1 },
      };
    }

    case "SET_NIGHT_ACTION_QUEUE":
      return {
        ...state,
        nightActionQueue: action.queue,
        currentQueueIndex: 0, // 重置索引
        currentWakeIndex: 0,
        selectedActionTargets: [], // 清空选中目标
      };

    case "NEXT_NIGHT_ACTION": {
      // 自动跳过已死亡且无能力的角色
      let nextIndex = state.currentQueueIndex + 1;
      while (nextIndex < state.nightActionQueue.length) {
        const nextSeat = state.nightActionQueue[nextIndex];
        // 检查座位是否仍然存在且有效
        const currentSeat = state.seats.find((s) => s.id === nextSeat.id);
        if (!currentSeat) {
          nextIndex++;
          continue;
        }
        // 排除已死亡且无能力的角色（特殊：乌鸦守护者即使死亡也要执行）
        const roleId =
          currentSeat.role?.id === "drunk"
            ? currentSeat.charadeRole?.id
            : currentSeat.role?.id;
        const isDeadAndNoAbility =
          currentSeat.isDead && !currentSeat.hasAbilityEvenDead;
        const isRavenkeeper =
          roleId === "ravenkeeper" &&
          state.deadThisNight.includes(currentSeat.id);
        if (!isDeadAndNoAbility || isRavenkeeper) {
          break;
        }
        nextIndex++;
      }
      return {
        ...state,
        currentQueueIndex: nextIndex,
        currentWakeIndex: nextIndex,
        selectedActionTargets: [],
        inspectionResult: null,
      };
    }

    case "PREV_NIGHT_ACTION": {
      const prevIndex = Math.max(0, state.currentQueueIndex - 1);
      return {
        ...state,
        currentQueueIndex: prevIndex,
        currentWakeIndex: prevIndex,
        selectedActionTargets: [],
        inspectionResult: null,
      };
    }

    case "SET_CURRENT_QUEUE_INDEX":
      return {
        ...state,
        currentQueueIndex: action.index,
        currentWakeIndex: action.index,
      };

    case "SET_SELECTED_TARGETS":
      return { ...state, selectedActionTargets: action.targets };

    case "SET_SEATS":
      return { ...state, seats: preserveGhostVote(state.seats, action.seats) };

    case "UPDATE_SEATS": {
      const newSeats = action.updater(state.seats);
      return { ...state, seats: preserveGhostVote(state.seats, newSeats) };
    }

    case "UPDATE_SEAT": {
      const updatedSeats = state.seats.map((seat) =>
        seat.id === action.seatId ? { ...seat, ...action.updates } : seat
      );
      return { ...state, seats: preserveGhostVote(state.seats, updatedSeats) };
    }

    case "INCREMENT_NIGHT_COUNT":
      return { ...state, nightCount: state.nightCount + 1 };

    case "SET_DEAD_THIS_NIGHT":
      return { ...state, deadThisNight: action.deadIds };

    case "ADD_DEAD_THIS_NIGHT":
      return {
        ...state,
        deadThisNight: [...state.deadThisNight, action.deadId],
      };

    case "SET_EXECUTED_PLAYER":
      return { ...state, executedPlayerId: action.playerId };

    case "ADD_LOG":
      return { ...state, gameLogs: [...state.gameLogs, action.log] };

    case "SET_WIN_RESULT":
      // 🔧 P0 修复：原子更新 winResult + winReason，并自动弹出游戏结束弹窗
      return {
        ...state,
        winResult: action.result ?? state.winResult,
        winReason: action.reason ?? state.winReason,
        gamePhase: "gameOver",
        currentModal: { type: "GAME_OVER", data: null },
      };

    case "SET_CURRENT_HINT":
      return { ...state, currentHint: action.hint };

    case "SET_INSPECTION_RESULT":
      return { ...state, inspectionResult: action.result };

    case "CLEAR_NIGHT_STATE":
      return {
        ...state,
        selectedActionTargets: [],
        inspectionResult: null,
        currentHint: { isPoisoned: false, guide: "", speak: "" },
      };

    case "START_NIGHT": {
      // 进入夜晚时，设置队列并重置索引
      return {
        ...state,
        nightActionQueue: action.queue,
        currentQueueIndex: 0,
        currentWakeIndex: 0,
        selectedActionTargets: [],
        inspectionResult: null,
        gamePhase: action.isFirst ? "firstNight" : "night",
        nightCount: action.isFirst ? state.nightCount : state.nightCount + 1,
      };
    }

    case "RESET_GAME":
      // 重置游戏状态到初始值
      return getInitialState();

    case "FILTER_DEAD_FROM_QUEUE": {
      // 从队列中移除已死亡且无能力的角色（保留亡骨魔杀死的爪牙等）
      const filteredQueue = state.nightActionQueue.filter((queuedSeat) => {
        const currentSeat = state.seats.find((s) => s.id === queuedSeat.id);
        if (!currentSeat) return false;

        // 特殊处理：乌鸦守护者即使死亡也要执行（如果是今晚死亡的）
        const roleId =
          currentSeat.role?.id === "drunk"
            ? currentSeat.charadeRole?.id
            : currentSeat.role?.id;
        if (
          roleId === "ravenkeeper" &&
          state.deadThisNight.includes(currentSeat.id)
        ) {
          return true;
        }

        // 如果已死亡且无能力，则移除
        if (currentSeat.isDead && !currentSeat.hasAbilityEvenDead) {
          return false;
        }

        return true;
      });

      // 如果当前索引超出队列长度，调整索引
      const adjustedIndex =
        state.currentQueueIndex >= filteredQueue.length
          ? Math.max(0, filteredQueue.length - 1)
          : state.currentQueueIndex;

      return {
        ...state,
        nightActionQueue: filteredQueue,
        currentQueueIndex: adjustedIndex,
        currentWakeIndex: adjustedIndex,
      };
    }

    case "SET_HISTORY":
      // 历史记录暂不存储在state中，可以在需要时添加
      return state;

    case "UPDATE_STATE": {
      const isEnteringGameOver =
        action.updates.gamePhase === "gameOver" &&
        state.gamePhase !== "gameOver";
      const updates = { ...action.updates };
      // 🎫 幽灵票单向锁存：任何经 UPDATE_STATE 写入的 seats（撤销/重做、读档、整表重建）
      //    都不得把已经用掉的幽灵票还回来
      if (updates.seats !== undefined) {
        updates.seats = preserveGhostVote(state.seats, updates.seats);
      }
      return {
        ...state,
        ...updates,
        ...(isEnteringGameOver && action.updates.currentModal === undefined
          ? { currentModal: { type: "GAME_OVER", data: null } }
          : {}),
      };
    }

    case "SET_OUTSIDER_DIED_TODAY":
      return { ...state, outsiderDiedToday: action.died };

    case "SET_GOSSIP_STATE":
      // 局部合并：只覆盖 action 里**显式给出**的字段（`null` 是合法值，用 !== undefined 判）
      return {
        ...state,
        ...(action.statement !== undefined
          ? { gossipStatementToday: action.statement }
          : {}),
        ...(action.isTrue !== undefined
          ? { gossipTrueTonight: action.isTrue }
          : {}),
        ...(action.sourceId !== undefined
          ? { gossipSourceSeatId: action.sourceId }
          : {}),
      };

    case "SET_MODAL":
      return { ...state, currentModal: action.modal };

    case "SET_VOTE_INPUT":
      return { ...state, voteInputValue: action.value };

    case "UPDATE_VOTED_THIS_ROUND": {
      const newList = action.remove
        ? state.votedThisRound.filter((id) => id !== action.voterId)
        : [...state.votedThisRound, action.voterId];
      return { ...state, votedThisRound: newList };
    }

    case "SET_HAS_EXECUTED_THIS_DAY":
      return { ...state, hasExecutedThisDay: action.hasExecuted };

    case "SET_NOMINATION_RECORDS":
      return { ...state, nominationRecords: action.records };

    case "SET_DUSK_EXECUTION":
      console.log(
        "[Reducer] SET_DUSK_EXECUTION last:",
        action.last,
        "current:",
        action.current
      );
      return {
        ...state,
        lastDuskExecution: action.last,
        currentDuskExecution: action.current,
      };

    case "SET_TIMER":
      return { ...state, timer: action.timer };

    case "SET_START_TIME":
      return { ...state, startTime: action.time };

    case "SET_GAME_RECORDS":
      return { ...state, gameRecords: action.records };

    case "UPDATE_USED_ONCE_ABILITIES": {
      const current = state.usedOnceAbilities[action.roleId] || [];
      return {
        ...state,
        usedOnceAbilities: {
          ...state.usedOnceAbilities,
          [action.roleId]: [...current, action.seatId],
        },
      };
    }

    case "UPDATE_PUKKA_QUEUE":
      return { ...state, pukkaPoisonQueue: action.queue };

    case "SET_VFX_TRIGGER":
      return { ...state, vfxTrigger: action.trigger };

    case "DECLARE_MAYOR_WIN":
      return {
        ...state,
        winResult: "good",
        winReason: "镇长身份获胜",
        gamePhase: "gameOver",
      };

    case "SET_ACTIVE_FABLED":
      return { ...state, activeFabled: action.fabled };

    case "TOGGLE_FABLED": {
      const exists = state.activeFabled.some((f) => f.id === action.role.id);
      return {
        ...state,
        activeFabled: exists
          ? state.activeFabled.filter((f) => f.id !== action.role.id)
          : [...state.activeFabled, action.role],
      };
    }

    // ── 流放（Exile · Round 10b）────────────────────────────────────
    // ⚠️ 流放死亡绕过 killPlayer 咽喉（useGameController.ts:605）：
    //    不触发终局检查、不触发死亡类能力、不写 executedToday
    //    （送葬者只认处决死）。判据：src/utils/exile.ts + 派单规格。
    case "PROPOSE_EXILE":
      return {
        ...state,
        exileProposedToday: {
          targetKind: action.targetKind,
          targetId: action.targetId,
          proposerId: action.proposerId,
          votes: [],
        },
      };

    case "CAST_EXILE_VOTE": {
      if (!state.exileProposedToday) return state;
      const { votes } = state.exileProposedToday;
      if (votes.includes(action.voterId)) return state; // 重复投票去重
      return {
        ...state,
        exileProposedToday: {
          ...state.exileProposedToday,
          votes: [...votes, action.voterId],
        },
      };
    }

    case "RESOLVE_EXILE": {
      const proposal = state.exileProposedToday;
      if (!proposal) return state;
      // 门槛 = 全体玩家（无论生死）一半向上取整。
      // ⚠️ 「全体玩家」含旅行者（官方：旅行者是玩家，只是不占剧本配比）——
      //    2026-10-12 交互审查修正：曾漏计 travelers，15 人局 +2 旅行者时
      //    门槛应为 ceil(17/2)=9 而非 8。
      const totalPlayers =
        state.seats.length +
        (state.travelers ?? []).filter(Boolean).length;
      const threshold = exileThreshold(totalPlayers);
      const passed = isExilePassed(proposal.votes.length, threshold);
      if (!passed) {
        return { ...state, exileProposedToday: null };
      }

      // ── 怪咖（Deviant）官方豁免 ──────────────────────────────────
      // 「如果你表现得很有趣，当天你不能被流放。」
      // ⇒ 票数够了也不生效，且不消耗本次提案（直接作废）。
      const targetRoleId =
        proposal.targetKind === "traveler"
          ? (state.travelers?.[proposal.targetId]?.id ?? null)
          : (state.seats.find((s) => s.id === proposal.targetId)?.role?.id ??
            null);
      if (
        isExileBlockedByDeviant(targetRoleId, action.deviantAmusing === true)
      ) {
        return { ...state, exileProposedToday: null };
      }

      if (proposal.targetKind === "traveler") {
        // 旅行者流放 = 离开游戏：置 null（不占座位、不触发任何死亡语义）
        const travelers = state.travelers.map((t, i) =>
          i === proposal.targetId ? null : t
        );
        return { ...state, travelers, exileProposedToday: null };
      }
      // 玩家座位流放 = 死（绕过 killPlayer：不触发终局/能力/executedToday）。
      // dayCount 用 nightCount 近似（引擎无独立 dayCount 字段）。
      const outcome = applyExileDeath(
        state.seats,
        proposal.targetId,
        state.nightCount
      );
      return {
        ...state,
        seats: outcome.seats,
        exileProposedToday: null,
      };
    }

    case "CANCEL_EXILE":
      // 取消投票：无副作用清空（区别于 RESOLVE_EXILE 的结算语义）。
      // 无提案时原样返回（保持引用相等，防调用方无谓重渲染）。
      if (!state.exileProposedToday) return state;
      return { ...state, exileProposedToday: null };

    default:
      return state;
  }
}

/**
 * 初始状态
 */
/** 导出以便测试（构造真实初始 state） */
export function getInitialState(): GameState {
  return {
    mounted: false,
    showIntroLoading: true,
    gameId: `game_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    hadesiaChoiceEnabled: false,
    pastGames: [],
    seatNotes: {},
    isPortrait: false,
    seats: [],
    victorySnapshot: [],
    initialSeats: [],
    gamePhase: "scriptSelection",
    selectedScript: null,
    nightCount: 1,
    hasCompletedFirstNight: false,
    deadThisNight: [],
    executedPlayerId: null,
    gameLogs: [],
    winResult: null,
    winReason: null,
    nightActionQueue: [],
    currentQueueIndex: 0,
    wakeQueueIds: [],
    currentWakeIndex: 0,
    selectedActionTargets: [],
    currentHint: { isPoisoned: false, guide: "", speak: "" },
    inspectionResult: null,
    inspectionResultKey: 0,
    todayDemonVoted: false,
    todayMinionNominated: false,
    todayExecutedId: null,
    witchCursedId: null,
    witchActive: false,
    cerenovusTarget: null,
    isVortoxWorld: false,
    fangGuConverted: false,
    jugglerGuesses: {},
    evilTwinPair: null,
    startTime: null,
    timer: 0,
    selectedRole: null,
    contextMenu: null,
    showMenu: false,
    longPressingSeats: new Set(),
    currentModal: null,
    dayAbilityForm: {},
    baronSetupCheck: null,
    ignoreBaronSetup: false,
    compositionError: null,
    voteInputValue: "",
    showVoteErrorToast: false,
    gameRecords: [],
    mayorRedirectTarget: null,
    nightOrderPreview: [],
    pendingNightQueue: null,
    nightQueuePreviewTitle: "",
    firstNightOrder: [],
    poppyGrowerDead: false,
    klutzChoiceTarget: null,

    lastExecutedPlayerId: null,
    damselGuessed: false,
    shamanKeyword: null,
    shamanTriggered: false,
    shamanConvertTarget: null,
    spyDisguiseMode: "default",
    spyDisguiseProbability: 0.8,
    pukkaPoisonQueue: [],
    poChargeState: {},
    autoRedHerringInfo: null,
    dayAbilityLogs: [],
    damselGuessUsedBy: [],
    usedOnceAbilities: {},
    usedDailyAbilities: {},
    nominationMap: {},
    balloonistKnownTypes: {},
    balloonistCompletedIds: [],
    hadesiaChoices: {},
    virginGuideInfo: null,
    voteRecords: [],
    votedThisRound: [],
    hasExecutedThisDay: false,
    mastermindFinalDay: null,
    remainingDays: null,
    goonDrunkedThisNight: false,
    nominationRecords: { nominators: new Set(), nominees: new Set() },
    lastDuskExecution: null,
    currentDuskExecution: null,
    history: [],
    historyIndex: -1,
    reminderTokens: {},
    outsiderDiedToday: false,
    gossipStatementToday: "",
    gossipTrueTonight: false,
    gossipSourceSeatId: null,
    vfxTrigger: null,
    activeFabled: [],
    travelers: Array.from({ length: TRAVELER_MAX }, () => null),
    exileProposedToday: null,
    twilightStepIndex: 0,
    twilightVoteTargets: { bureaucratTargetId: null, thiefTargetId: null },
    travelerHookChoices: {
      scapegoatSubstituteForId: null,
      gunslingerEligibleVoterIds: [],
      gunslingerTargetId: null,
      gunslingerWindowNight: null,
      gunslingerUsedNight: null,
      judgeUsedThisGame: false,
      butcherExtraExecutionDay: null,
      boneCollectorUsed: false,
      boneCollectorTargetId: null,
      baristaTargetId: null,
      baristaEffect: null,
      harlotTargetId: null,
      harlotAgreed: false,
      harlotDoomed: false,
      apprenticeGrantedRoleId: null,
      matronSwaps: [],
    },
    fabledState: {
      fibbinUsed: false,
      fibbinTargetId: null,
      angelProtectedSeatId: null,
      angelPunishedSeatId: null,
      revolutionaryPair: null,
      revolutionaryDisguiseUsed: false,
      sentinelOutsiderDelta: 0,
      spiritOfIvoryCapped: false,
      ferrymanLastDayResolved: false,
      toymakerAttackSkipped: false,
      revolutionaryDisguise: null,
      fiddlerPair: null,
      fiddlerWinner: null,
      fiddlerUsed: false,
      duchessVisitIds: [],
      duchessEvilCount: null,
    },
    travelerAlignments: {},
    beggarState: { tokens: 0, donations: [] },
    isPrivacyShieldActive: false,
  };
}

/**
 * GameContext 类型
 */
interface GameContextType {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  currentQueueIndexRef: React.MutableRefObject<number>;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

/**
 * GameProvider - 提供游戏状态和派发器
 */
export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, getInitialState());
  const currentQueueIndexRef = useRef(0);

  useEffect(() => {
    currentQueueIndexRef.current = state.currentQueueIndex;
  }, [state.currentQueueIndex]);

  return (
    <GameContext.Provider value={{ state, dispatch, currentQueueIndexRef }}>
      {children}
    </GameContext.Provider>
  );
}

/**
 * useGameContext - 使用游戏上下文的Hook
 */
export function useGameContext() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error("useGameContext must be used within a GameProvider");
  }
  return context;
}

/**
 * 便捷的Action创建函数
 */
export const gameActions = {
  setGamePhase: (phase: GamePhase): GameAction => ({
    type: "SET_GAME_PHASE",
    phase,
  }),
  /** 暮色阶段：设置当前步骤游标 */
  setTwilightStep: (index: number): GameAction => ({
    type: "SET_TWILIGHT_STEP",
    index,
  }),
  /** 暮色阶段：官员/窃贼选定（或取消）投票目标 */
  setTwilightVoteTarget: (
    role: "bureaucrat" | "thief",
    targetId: number | null
  ): GameAction => ({
    type: "SET_TWILIGHT_VOTE_TARGET",
    role,
    targetId,
  }),
  /** 旅行者阵营指定（落座时说书人选择；null = 清除，回到默认善良） */
  setTravelerAlignment: (
    slot: number,
    alignment: "good" | "evil" | null
  ): GameAction => ({
    type: "SET_TRAVELER_ALIGNMENT",
    slot,
    alignment,
  }),
  /** 🥣 乞丐：死亡玩家把投票标记给他（⇒ tokens+1 且乞丐得知其阵营） */
  giveBeggarToken: (donorSeatId: number): GameAction => ({
    type: "GIVE_BEGGAR_TOKEN",
    donorSeatId,
  }),
  /** 🥣 乞丐：以自己名义投票 ⇒ 消耗 1 枚投票标记 */
  consumeBeggarToken: (): GameAction => ({ type: "CONSUME_BEGGAR_TOKEN" }),
  /** ⚖️ 法官：行使能力（每局限一次）—— `execute` 直接处决 / `void` 投票无效 */
  markJudgeUsed: (outcome: "execute" | "void"): GameAction => ({
    type: "MARK_JUDGE_USED",
    outcome,
  }),
  /** 🥩 屠夫：本白天使用「首次处决后再提名」（允许第二次处决） */
  markButcherExtraExecution: (night: number): GameAction => ({
    type: "MARK_BUTCHER_EXTRA_EXECUTION",
    night,
  }),
  /** 🦴 集骨者：祝福一名已死亡玩家（重新获得能力直到下个黄昏，每局限一次） */
  boneCollectorBless: (seatId: number): GameAction => ({
    type: "BONE_COLLECTOR_BLESS",
    seatId,
  }),
  /** 🦴 集骨者：撤销祝福（下个暮色开始时调用） */
  clearBoneCollectorBlessing: (): GameAction => ({
    type: "CLEAR_BONE_COLLECTOR_BLESSING",
  }),
  /** ☕ 咖啡师：说书人为一名玩家二选一（清除并免疫毒醉 / 能力两次） */
  setBaristaEffect: (
    targetId: number,
    effect: "clear" | "double"
  ): GameAction => ({ type: "SET_BARISTA_EFFECT", targetId, effect }),
  /** ☕ 咖啡师：撤销效果（下个暮色开始时调用） */
  clearBaristaEffect: (): GameAction => ({ type: "CLEAR_BARISTA_EFFECT" }),
  /** 🎴 传奇角色：说书人裁定的部分状态更新 */
  setFabledState: (
    updates: Partial<GameState["fabledState"]>
  ): GameAction => ({ type: "SET_FABLED_STATE", updates }),
  /** 🚣 摆渡人：最后一天，所有已死亡玩家重新获得投票标记 */
  ferrymanLastDay: (): GameAction => ({ type: "FERRYMAN_LAST_DAY" }),
  fabledSwapRole: (seatId: number, role: Role): GameAction => ({
    type: "FABLED_SWAP_ROLE",
    seatId,
    role,
  }),
  fabledFibbinMisinfo: (seatId: number): GameAction => ({
    type: "FABLED_FIBBIN_MISINFO",
    seatId,
  }),
  /** 🪑 女舍监：交换两名玩家的座位（每白天至多三对） */
  matronSwap: (a: number, b: number): GameAction => ({
    type: "MATRON_SWAP",
    a,
    b,
  }),
  /** 🪑 女舍监：新白天清空本日换座记录 */
  clearMatronSwaps: (): GameAction => ({ type: "CLEAR_MATRON_SWAPS" }),
  /** 🎓 学徒：首个夜晚选定被授予的角色（善良→镇民 / 邪恶→爪牙） */
  setApprenticeGrantedRole: (roleId: string | null): GameAction => ({
    type: "SET_APPRENTICE_ROLE",
    roleId,
  }),
  /** 🌙 流莺：说书人裁定目标 / 是否同意 / 是否双死 */
  setHarlotOutcome: (
    targetId: number | null,
    opts?: { agreed?: boolean; doomed?: boolean }
  ): GameAction => ({
    type: "SET_HARLOT_OUTCOME",
    targetId,
    agreed: opts?.agreed,
    doomed: opts?.doomed,
  }),
  /** 进入暮色时清空上一夜的投票目标（防残留加成） */
  clearTwilightVoteTargets: (): GameAction => ({
    type: "CLEAR_TWILIGHT_VOTE_TARGETS",
  }),
  setNightActionQueue: (queue: Seat[]): GameAction => ({
    type: "SET_NIGHT_ACTION_QUEUE",
    queue,
  }),
  nextNightAction: (): GameAction => ({ type: "NEXT_NIGHT_ACTION" }),
  prevNightAction: (): GameAction => ({ type: "PREV_NIGHT_ACTION" }),
  setCurrentQueueIndex: (index: number): GameAction => ({
    type: "SET_CURRENT_QUEUE_INDEX",
    index,
  }),
  setSelectedTargets: (targets: number[]): GameAction => ({
    type: "SET_SELECTED_TARGETS",
    targets,
  }),
  setSeats: (seats: Seat[]): GameAction => ({ type: "SET_SEATS", seats }),
  updateSeat: (seatId: number, updates: Partial<Seat>): GameAction => ({
    type: "UPDATE_SEAT",
    seatId,
    updates,
  }),
  incrementNightCount: (): GameAction => ({ type: "INCREMENT_NIGHT_COUNT" }),
  setDeadThisNight: (deadIds: number[]): GameAction => ({
    type: "SET_DEAD_THIS_NIGHT",
    deadIds,
  }),
  addDeadThisNight: (deadId: number): GameAction => ({
    type: "ADD_DEAD_THIS_NIGHT",
    deadId,
  }),
  setExecutedPlayer: (playerId: number | null): GameAction => ({
    type: "SET_EXECUTED_PLAYER",
    playerId,
  }),
  addLog: (log: LogEntry): GameAction => ({ type: "ADD_LOG", log }),
  setWinResult: (result: WinResult, reason: string | null): GameAction => ({
    type: "SET_WIN_RESULT",
    result,
    reason,
  }),
  setCurrentHint: (hint: NightHintState): GameAction => ({
    type: "SET_CURRENT_HINT",
    hint,
  }),
  setInspectionResult: (result: string | null): GameAction => ({
    type: "SET_INSPECTION_RESULT",
    result,
  }),
  clearNightState: (): GameAction => ({ type: "CLEAR_NIGHT_STATE" }),
  startNight: (queue: Seat[], isFirst: boolean): GameAction => ({
    type: "START_NIGHT",
    queue,
    isFirst,
  }),
  resetGame: (): GameAction => ({ type: "RESET_GAME" }),
  filterDeadFromQueue: (): GameAction => ({ type: "FILTER_DEAD_FROM_QUEUE" }),
  setHistory: (history: any[]): GameAction => ({
    type: "SET_HISTORY",
    history,
  }),
  saveHistory: (overrideState?: Partial<GameState>): GameAction => ({
    type: "SAVE_HISTORY",
    overrideState,
  }),
  updateState: (updates: Partial<GameState>): GameAction => ({
    type: "UPDATE_STATE",
    updates,
  }),
  setOutsiderDiedToday: (died: boolean): GameAction => ({
    type: "SET_OUTSIDER_DIED_TODAY",
    died,
  }),
  setGossipState: (partial: {
    statement?: string;
    isTrue?: boolean;
    sourceId?: number | null;
  }): GameAction => ({ type: "SET_GOSSIP_STATE", ...partial }),
  setModal: (modal: ModalType): GameAction => ({ type: "SET_MODAL", modal }),
  setVoteInput: (value: string): GameAction => ({
    type: "SET_VOTE_INPUT",
    value,
  }),
  updateVotedThisRound: (voterId: number, remove?: boolean): GameAction => ({
    type: "UPDATE_VOTED_THIS_ROUND",
    voterId,
    remove,
  }),
  setHasExecutedThisDay: (hasExecuted: boolean): GameAction => ({
    type: "SET_HAS_EXECUTED_THIS_DAY",
    hasExecuted,
  }),
  setNominationRecords: (records: {
    nominators: Set<number>;
    nominees: Set<number>;
  }): GameAction => ({ type: "SET_NOMINATION_RECORDS", records }),
  setDuskExecution: (
    last: number | null,
    current: number | null
  ): GameAction => ({ type: "SET_DUSK_EXECUTION", last, current }),
  setTimer: (timer: number): GameAction => ({ type: "SET_TIMER", timer }),
  setStartTime: (time: Date | null): GameAction => ({
    type: "SET_START_TIME",
    time,
  }),
  setGameRecords: (records: GameRecord[]): GameAction => ({
    type: "SET_GAME_RECORDS",
    records,
  }),
  updateUsedOnceAbilities: (roleId: string, seatId: number): GameAction => ({
    type: "UPDATE_USED_ONCE_ABILITIES",
    roleId,
    seatId,
  }),
  updatePukkaQueue: (
    queue: { targetId: number; nightsUntilDeath: number }[]
  ): GameAction => ({ type: "UPDATE_PUKKA_QUEUE", queue }),
  declareMayorWin: (): GameAction => ({ type: "DECLARE_MAYOR_WIN" }),
  setActiveFabled: (fabled: Role[]): GameAction => ({
    type: "SET_ACTIVE_FABLED",
    fabled,
  }),
  toggleFabled: (role: Role): GameAction => ({
    type: "TOGGLE_FABLED",
    role,
  }),
  // ── 流放（Exile · Round 10b）─────────────────────────────────────
  proposeExile: (
    targetKind: "traveler" | "seat",
    targetId: number,
    proposerId = 0
  ): GameAction => ({
    type: "PROPOSE_EXILE",
    targetKind,
    targetId,
    proposerId,
  }),
  castExileVote: (voterId: number): GameAction => ({
    type: "CAST_EXILE_VOTE",
    voterId,
  }),
  resolveExile: (deviantAmusing = false): GameAction => ({
    type: "RESOLVE_EXILE",
    deviantAmusing,
  }),
  cancelExile: (): GameAction => ({ type: "CANCEL_EXILE" }),
  setSelectedRole: (selectedRole: Role | null): GameAction => ({
    type: "UPDATE_STATE",
    updates: { selectedRole },
  }),
  setPrivacyShieldActive: (active: boolean): GameAction => ({
    type: "SET_PRIVACY_SHIELD_ACTIVE",
    active,
  }),
  togglePrivacyShield: (): GameAction => ({
    type: "TOGGLE_PRIVACY_SHIELD",
  }),
};
