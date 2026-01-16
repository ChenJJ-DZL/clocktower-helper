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
  currentQueueIndex: number; // 当前队列索引（替代currentWakeIndex）
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
  
  // 时间状态
  startTime: Date | null;
  timer: number;
  
  // UI状态
  selectedRole: Role | null;
  contextMenu: { x: number; y: number; seatId: number } | null;
  showMenu: boolean;
  longPressingSeats: Set<number>;
  
  // 模态框状态
  currentModal: ModalType;
  
  // 其他游戏状态...
  // (这里可以继续添加其他状态，保持集中管理)
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
};

