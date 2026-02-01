"use client";

import React, { createContext, useContext, useReducer, useCallback, ReactNode } from "react";
import type { Seat, Role, GamePhase, WinResult, LogEntry, Script } from "../../app/data";
import { NightHintState, GameRecord } from "../types/game";
import { ModalType } from "../types/modal";

/**
 * 游戏状态接口 - 单一数据源
 * 所有游戏状态都存储在这里
 */
export interface GameState {
  // 基础状态
  mounted: boolean;
  showIntroLoading: boolean;
  isPortrait: boolean;

  // 座位和游戏核心状态
  seats: Seat[];
  initialSeats: Seat[];
  gamePhase: GamePhase;
  selectedScript: Script | null;
  nightCount: number;
  deadThisNight: number[]; // 存储玩家ID
  executedPlayerId: number | null;
  gameLogs: LogEntry[];
  winResult: WinResult;
  winReason: string | null;

  // 夜间行动队列 - 核心状态
  nightActionQueue: Seat[]; // 动态生成的夜间行动队列
  currentQueueIndex: number; // 当前队列索引
  wakeQueueIds: number[];    // 兼容旧系统的ID列表
  currentWakeIndex: number;  // 兼容旧系统的索引
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
  cerenovusTarget: { targetId: number; roleName: string } | null;
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
  showShootModal: number | null;
  showNominateModal: number | null;
  dayAbilityForm: any;
  baronSetupCheck: any;
  ignoreBaronSetup: boolean;
  compositionError: any;
  showRavenkeeperResultModal: any;
  showAttackBlockedModal: any;
  showBarberSwapModal: any;
  showNightDeathReportModal: string | null;
  voteInputValue: string;
  showVoteErrorToast: boolean;
  gameRecords: GameRecord[];
  mayorRedirectTarget: number | null;
  nightOrderPreview: any[];
  pendingNightQueue: Seat[] | null;
  nightQueuePreviewTitle: string;
  firstNightOrder: any[];
  poppyGrowerDead: boolean;
  klutzChoiceTarget: number | null;
  showKlutzChoiceModal: any;
  showSweetheartDrunkModal: any;
  showMoonchildKillModal: any;
  lastExecutedPlayerId: number | null;
  damselGuessed: boolean;
  shamanKeyword: string | null;
  shamanTriggered: boolean;
  shamanConvertTarget: number | null;
  spyDisguiseMode: 'off' | 'default' | 'on';
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
  hadesiaChoices: Record<number, 'live' | 'die'>;
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
  history: Array<any>; // 存储历史快照用于撤销
  showKillConfirmModal: number | null;
  showMayorRedirectModal: any;
  showPitHagModal: any;
  showRangerModal: any;
  showDamselGuessModal: any;
  showShamanConvertModal: boolean;
  showHadesiaKillConfirmModal: number[] | null;
  showPoisonConfirmModal: number | null;
  showPoisonEvilConfirmModal: number | null;
  showRestartConfirmModal: boolean;
  showSpyDisguiseModal: boolean;
  showMayorThreeAliveModal: boolean;
  showDrunkModal: number | null;
  showVoteInputModal: number | null;
  showRoleSelectModal: any;
  showMadnessCheckModal: any;
  showDayActionModal: any;
  showDayAbilityModal: any;
  showSaintExecutionConfirmModal: any;
  showLunaticRpsModal: any;
  showVirginTriggerModal: any;
  showRavenkeeperFakeModal: number | null;
  showStorytellerDeathModal: any;
  showReviewModal: boolean;
  showGameRecordsModal: boolean;
  showRoleInfoModal: boolean;
  showExecutionResultModal: any;
  showShootResultModal: any;
  showNightOrderModal: boolean;
  showFirstNightOrderModal: boolean;
  showMinionKnowDemonModal: any;
}

/**
 * Action类型 - 所有状态修改都通过Action
 */
export type GameAction =
  | { type: 'SET_GAME_PHASE'; phase: GamePhase }
  | { type: 'SET_NIGHT_ACTION_QUEUE'; queue: Seat[] }
  | { type: 'NEXT_NIGHT_ACTION' }
  | { type: 'PREV_NIGHT_ACTION' }
  | { type: 'SET_CURRENT_QUEUE_INDEX'; index: number }
  | { type: 'SET_SELECTED_TARGETS'; targets: number[] }
  | { type: 'SET_SEATS'; seats: Seat[] }
  | { type: 'UPDATE_SEAT'; seatId: number; updates: Partial<Seat> }
  | { type: 'INCREMENT_NIGHT_COUNT' }
  | { type: 'SET_DEAD_THIS_NIGHT'; deadIds: number[] }
  | { type: 'ADD_DEAD_THIS_NIGHT'; deadId: number }
  | { type: 'SET_EXECUTED_PLAYER'; playerId: number | null }
  | { type: 'ADD_LOG'; log: LogEntry }
  | { type: 'SET_WIN_RESULT'; result: WinResult; reason: string | null }
  | { type: 'SET_CURRENT_HINT'; hint: NightHintState }
  | { type: 'SET_INSPECTION_RESULT'; result: string | null }
  | { type: 'CLEAR_NIGHT_STATE' }
  | { type: 'START_NIGHT'; queue: Seat[]; isFirst: boolean }
  | { type: 'RESET_GAME' }
  | { type: 'FILTER_DEAD_FROM_QUEUE' } // 从队列中移除已死亡且无能力的角色
  | { type: 'SET_HISTORY'; history: Array<any> } // 设置历史记录
  | { type: 'UPDATE_STATE'; updates: Partial<GameState> } // 通用更新Action
  | { type: 'SET_OUTSIDER_DIED_TODAY'; died: boolean }
  | { type: 'SET_GOSSIP_STATE'; statement: string; isTrue: boolean; sourceId: number | null }
  | { type: 'SET_MODAL'; modal: ModalType }
  | { type: 'SET_VOTE_INPUT'; value: string }
  | { type: 'UPDATE_VOTED_THIS_ROUND'; voterId: number; remove?: boolean }
  | { type: 'SET_HAS_EXECUTED_THIS_DAY'; hasExecuted: boolean }
  | { type: 'SET_NOMINATION_RECORDS'; records: { nominators: Set<number>; nominees: Set<number> } }
  | { type: 'SET_DUSK_EXECUTION'; last: number | null; current: number | null }
  | { type: 'SET_TIMER'; timer: number }
  | { type: 'SET_START_TIME'; time: Date | null }
  | { type: 'SET_GAME_RECORDS'; records: GameRecord[] }
  | { type: 'UPDATE_USED_ONCE_ABILITIES'; roleId: string; seatId: number }
  | { type: 'UPDATE_PUKKA_QUEUE'; queue: { targetId: number; nightsUntilDeath: number }[] }
// ... 可以继续添加更多Action

/**
 * GameReducer - 统一处理所有状态更新
 */
function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_GAME_PHASE':
      return { ...state, gamePhase: action.phase };

    case 'SET_NIGHT_ACTION_QUEUE':
      return {
        ...state,
        nightActionQueue: action.queue,
        currentQueueIndex: 0, // 重置索引
        selectedActionTargets: [], // 清空选中目标
      };

    case 'NEXT_NIGHT_ACTION': {
      // 自动跳过已死亡且无能力的角色
      let nextIndex = state.currentQueueIndex + 1;
      while (nextIndex < state.nightActionQueue.length) {
        const nextSeat = state.nightActionQueue[nextIndex];
        // 检查座位是否仍然存在且有效
        const currentSeat = state.seats.find(s => s.id === nextSeat.id);
        if (!currentSeat) {
          nextIndex++;
          continue;
        }
        // 排除已死亡且无能力的角色（特殊：乌鸦守护者即使死亡也要执行）
        const roleId = currentSeat.role?.id === 'drunk'
          ? currentSeat.charadeRole?.id
          : currentSeat.role?.id;
        const isDeadAndNoAbility = currentSeat.isDead && !currentSeat.hasAbilityEvenDead;
        const isRavenkeeper = roleId === 'ravenkeeper' && state.deadThisNight.includes(currentSeat.id);
        if (!isDeadAndNoAbility || isRavenkeeper) {
          break;
        }
        nextIndex++;
      }
      return {
        ...state,
        currentQueueIndex: nextIndex,
        selectedActionTargets: [],
        inspectionResult: null,
      };
    }

    case 'PREV_NIGHT_ACTION': {
      const prevIndex = Math.max(0, state.currentQueueIndex - 1);
      return {
        ...state,
        currentQueueIndex: prevIndex,
        selectedActionTargets: [],
        inspectionResult: null,
      };
    }

    case 'SET_CURRENT_QUEUE_INDEX':
      return { ...state, currentQueueIndex: action.index };

    case 'SET_SELECTED_TARGETS':
      return { ...state, selectedActionTargets: action.targets };

    case 'SET_SEATS':
      return { ...state, seats: action.seats };

    case 'UPDATE_SEAT': {
      const updatedSeats = state.seats.map(seat =>
        seat.id === action.seatId ? { ...seat, ...action.updates } : seat
      );
      return { ...state, seats: updatedSeats };
    }

    case 'INCREMENT_NIGHT_COUNT':
      return { ...state, nightCount: state.nightCount + 1 };

    case 'SET_DEAD_THIS_NIGHT':
      return { ...state, deadThisNight: action.deadIds };

    case 'ADD_DEAD_THIS_NIGHT':
      return {
        ...state,
        deadThisNight: [...state.deadThisNight, action.deadId],
      };

    case 'SET_EXECUTED_PLAYER':
      return { ...state, executedPlayerId: action.playerId };

    case 'ADD_LOG':
      return { ...state, gameLogs: [...state.gameLogs, action.log] };

    case 'SET_WIN_RESULT':
      return {
        ...state,
        winResult: action.result,
        winReason: action.reason,
        gamePhase: 'gameOver',
      };

    case 'SET_CURRENT_HINT':
      return { ...state, currentHint: action.hint };

    case 'SET_INSPECTION_RESULT':
      return { ...state, inspectionResult: action.result };

    case 'CLEAR_NIGHT_STATE':
      return {
        ...state,
        selectedActionTargets: [],
        inspectionResult: null,
        currentHint: { isPoisoned: false, guide: '', speak: '' },
      };

    case 'START_NIGHT': {
      // 进入夜晚时，设置队列并重置索引
      return {
        ...state,
        nightActionQueue: action.queue,
        currentQueueIndex: 0,
        selectedActionTargets: [],
        inspectionResult: null,
        gamePhase: action.isFirst ? 'firstNight' : 'night',
        nightCount: action.isFirst ? state.nightCount : state.nightCount + 1,
      };
    }

    case 'RESET_GAME':
      // 重置游戏状态到初始值
      return getInitialState();

    case 'FILTER_DEAD_FROM_QUEUE': {
      // 从队列中移除已死亡且无能力的角色（保留亡骨魔杀死的爪牙等）
      const filteredQueue = state.nightActionQueue.filter(queuedSeat => {
        const currentSeat = state.seats.find(s => s.id === queuedSeat.id);
        if (!currentSeat) return false;

        // 特殊处理：乌鸦守护者即使死亡也要执行（如果是今晚死亡的）
        const roleId = currentSeat.role?.id === 'drunk'
          ? currentSeat.charadeRole?.id
          : currentSeat.role?.id;
        if (roleId === 'ravenkeeper' && state.deadThisNight.includes(currentSeat.id)) {
          return true;
        }

        // 如果已死亡且无能力，则移除
        if (currentSeat.isDead && !currentSeat.hasAbilityEvenDead) {
          return false;
        }

        return true;
      });

      // 如果当前索引超出队列长度，调整索引
      const adjustedIndex = state.currentQueueIndex >= filteredQueue.length
        ? Math.max(0, filteredQueue.length - 1)
        : state.currentQueueIndex;

      return {
        ...state,
        nightActionQueue: filteredQueue,
        currentQueueIndex: adjustedIndex,
      };
    }

    case 'SET_HISTORY':
      // 历史记录暂不存储在state中，可以在需要时添加
      return state;

    case 'UPDATE_STATE':
      return { ...state, ...action.updates };

    case 'SET_OUTSIDER_DIED_TODAY':
      return { ...state, outsiderDiedToday: action.died };

    case 'SET_GOSSIP_STATE':
      return {
        ...state,
        gossipStatementToday: action.statement,
        gossipTrueTonight: action.isTrue,
        gossipSourceSeatId: action.sourceId,
      };

    case 'SET_MODAL':
      return { ...state, currentModal: action.modal };

    case 'SET_VOTE_INPUT':
      return { ...state, voteInputValue: action.value };

    case 'UPDATE_VOTED_THIS_ROUND': {
      const newList = action.remove
        ? state.votedThisRound.filter(id => id !== action.voterId)
        : [...state.votedThisRound, action.voterId];
      return { ...state, votedThisRound: newList };
    }

    case 'SET_HAS_EXECUTED_THIS_DAY':
      return { ...state, hasExecutedThisDay: action.hasExecuted };

    case 'SET_NOMINATION_RECORDS':
      return { ...state, nominationRecords: action.records };

    case 'SET_DUSK_EXECUTION':
      return { ...state, lastDuskExecution: action.last, currentDuskExecution: action.current };

    case 'SET_TIMER':
      return { ...state, timer: action.timer };

    case 'SET_START_TIME':
      return { ...state, startTime: action.time };

    case 'SET_GAME_RECORDS':
      return { ...state, gameRecords: action.records };

    case 'UPDATE_USED_ONCE_ABILITIES': {
      const current = state.usedOnceAbilities[action.roleId] || [];
      return {
        ...state,
        usedOnceAbilities: {
          ...state.usedOnceAbilities,
          [action.roleId]: [...current, action.seatId]
        }
      };
    }

    case 'UPDATE_PUKKA_QUEUE':
      return { ...state, pukkaPoisonQueue: action.queue };

    default:
      return state;
  }
}

/**
 * 初始状态
 */
function getInitialState(): GameState {
  return {
    mounted: false,
    showIntroLoading: true,
    isPortrait: false,
    seats: [],
    initialSeats: [],
    gamePhase: 'scriptSelection',
    selectedScript: null,
    nightCount: 1,
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
    currentHint: { isPoisoned: false, guide: '', speak: '' },
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
    showShootModal: null,
    showNominateModal: null,
    dayAbilityForm: {},
    baronSetupCheck: null,
    ignoreBaronSetup: false,
    compositionError: null,
    showRavenkeeperResultModal: null,
    showAttackBlockedModal: null,
    showBarberSwapModal: null,
    showNightDeathReportModal: null,
    voteInputValue: '',
    showVoteErrorToast: false,
    gameRecords: [],
    mayorRedirectTarget: null,
    nightOrderPreview: [],
    pendingNightQueue: null,
    nightQueuePreviewTitle: "",
    firstNightOrder: [],
    poppyGrowerDead: false,
    klutzChoiceTarget: null,
    showKlutzChoiceModal: null,
    showSweetheartDrunkModal: null,
    showMoonchildKillModal: null,
    lastExecutedPlayerId: null,
    damselGuessed: false,
    shamanKeyword: null,
    shamanTriggered: false,
    shamanConvertTarget: null,
    spyDisguiseMode: 'default',
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
    showKillConfirmModal: null,
    showMayorRedirectModal: null,
    showPitHagModal: null,
    showRangerModal: null,
    showDamselGuessModal: null,
    showShamanConvertModal: false,
    showHadesiaKillConfirmModal: null,
    showPoisonConfirmModal: null,
    showPoisonEvilConfirmModal: null,
    showRestartConfirmModal: false,
    showSpyDisguiseModal: false,
    showMayorThreeAliveModal: false,
    showDrunkModal: null,
    showVoteInputModal: null,
    showRoleSelectModal: null,
    showMadnessCheckModal: null,
    showDayActionModal: null,
    showDayAbilityModal: null,
    showSaintExecutionConfirmModal: null,
    showLunaticRpsModal: null,
    showVirginTriggerModal: null,
    showRavenkeeperFakeModal: null,
    showStorytellerDeathModal: null,
    showReviewModal: false,
    showGameRecordsModal: false,
    showRoleInfoModal: false,
    showExecutionResultModal: null,
    showShootResultModal: null,
    showNightOrderModal: false,
    showFirstNightOrderModal: false,
    showMinionKnowDemonModal: null,
    outsiderDiedToday: false,
    gossipStatementToday: "",
    gossipTrueTonight: false,
    gossipSourceSeatId: null,
  };
}

/**
 * GameContext 类型
 */
interface GameContextType {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

/**
 * GameProvider - 提供游戏状态和派发器
 */
export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, getInitialState());

  return (
    <GameContext.Provider value={{ state, dispatch }}>
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
    throw new Error('useGameContext must be used within a GameProvider');
  }
  return context;
}

/**
 * 便捷的Action创建函数
 */
export const gameActions = {
  setGamePhase: (phase: GamePhase): GameAction => ({ type: 'SET_GAME_PHASE', phase }),
  setNightActionQueue: (queue: Seat[]): GameAction => ({ type: 'SET_NIGHT_ACTION_QUEUE', queue }),
  nextNightAction: (): GameAction => ({ type: 'NEXT_NIGHT_ACTION' }),
  prevNightAction: (): GameAction => ({ type: 'PREV_NIGHT_ACTION' }),
  setCurrentQueueIndex: (index: number): GameAction => ({ type: 'SET_CURRENT_QUEUE_INDEX', index }),
  setSelectedTargets: (targets: number[]): GameAction => ({ type: 'SET_SELECTED_TARGETS', targets }),
  setSeats: (seats: Seat[]): GameAction => ({ type: 'SET_SEATS', seats }),
  updateSeat: (seatId: number, updates: Partial<Seat>): GameAction => ({ type: 'UPDATE_SEAT', seatId, updates }),
  incrementNightCount: (): GameAction => ({ type: 'INCREMENT_NIGHT_COUNT' }),
  setDeadThisNight: (deadIds: number[]): GameAction => ({ type: 'SET_DEAD_THIS_NIGHT', deadIds }),
  addDeadThisNight: (deadId: number): GameAction => ({ type: 'ADD_DEAD_THIS_NIGHT', deadId }),
  setExecutedPlayer: (playerId: number | null): GameAction => ({ type: 'SET_EXECUTED_PLAYER', playerId }),
  addLog: (log: LogEntry): GameAction => ({ type: 'ADD_LOG', log }),
  setWinResult: (result: WinResult, reason: string | null): GameAction => ({ type: 'SET_WIN_RESULT', result, reason }),
  setCurrentHint: (hint: NightHintState): GameAction => ({ type: 'SET_CURRENT_HINT', hint }),
  setInspectionResult: (result: string | null): GameAction => ({ type: 'SET_INSPECTION_RESULT', result }),
  clearNightState: (): GameAction => ({ type: 'CLEAR_NIGHT_STATE' }),
  startNight: (queue: Seat[], isFirst: boolean): GameAction => ({ type: 'START_NIGHT', queue, isFirst }),
  resetGame: (): GameAction => ({ type: 'RESET_GAME' }),
  filterDeadFromQueue: (): GameAction => ({ type: 'FILTER_DEAD_FROM_QUEUE' }),
  setHistory: (history: Array<any>): GameAction => ({ type: 'SET_HISTORY', history }),
  updateState: (updates: Partial<GameState>): GameAction => ({ type: 'UPDATE_STATE', updates }),
  setOutsiderDiedToday: (died: boolean): GameAction => ({ type: 'SET_OUTSIDER_DIED_TODAY', died }),
  setGossipState: (statement: string, isTrue: boolean, sourceId: number | null): GameAction =>
    ({ type: 'SET_GOSSIP_STATE', statement, isTrue, sourceId }),
  setModal: (modal: ModalType): GameAction => ({ type: 'SET_MODAL', modal }),
  setVoteInput: (value: string): GameAction => ({ type: 'SET_VOTE_INPUT', value }),
  updateVotedThisRound: (voterId: number, remove?: boolean): GameAction => ({ type: 'UPDATE_VOTED_THIS_ROUND', voterId, remove }),
  setHasExecutedThisDay: (hasExecuted: boolean): GameAction => ({ type: 'SET_HAS_EXECUTED_THIS_DAY', hasExecuted }),
  setNominationRecords: (records: { nominators: Set<number>; nominees: Set<number> }): GameAction => ({ type: 'SET_NOMINATION_RECORDS', records }),
  setDuskExecution: (last: number | null, current: number | null): GameAction => ({ type: 'SET_DUSK_EXECUTION', last, current }),
  setTimer: (timer: number): GameAction => ({ type: 'SET_TIMER', timer }),
  setStartTime: (time: Date | null): GameAction => ({ type: 'SET_START_TIME', time }),
  setGameRecords: (records: GameRecord[]): GameAction => ({ type: 'SET_GAME_RECORDS', records }),
  updateUsedOnceAbilities: (roleId: string, seatId: number): GameAction => ({ type: 'UPDATE_USED_ONCE_ABILITIES', roleId, seatId }),
  updatePukkaQueue: (queue: { targetId: number; nightsUntilDeath: number }[]): GameAction => ({ type: 'UPDATE_PUKKA_QUEUE', queue }),
};

