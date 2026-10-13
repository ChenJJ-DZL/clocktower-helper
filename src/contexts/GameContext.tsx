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
  | {
      type: "SET_GOSSIP_STATE";
      statement: string;
      isTrue: boolean;
      sourceId: number | null;
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
      return {
        ...state,
        gossipStatementToday: action.statement,
        gossipTrueTonight: action.isTrue,
        gossipSourceSeatId: action.sourceId,
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
  setGossipState: (
    statement: string,
    isTrue: boolean,
    sourceId: number | null
  ): GameAction => ({ type: "SET_GOSSIP_STATE", statement, isTrue, sourceId }),
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
