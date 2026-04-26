/**
 * 历史状态快照系统
 * 为回溯型能力提供支持，支持保存与回滚到任意时间点的游戏状态
 */

import type { GamePhase, LogEntry, Seat, WinResult } from "../../app/data";

/**
 * 游戏状态快照接口
 * 保存游戏在某个时间点的完整状态
 */
export interface GameStateSnapshot {
  // 快照元信息
  id: string;
  timestamp: number; // 时间戳
  phase: GamePhase; // 当前游戏阶段
  nightCount: number; // 第几个夜晚
  dayCount: number; // 第几个白天
  description: string; // 快照描述，便于识别
  triggerAction?: string; // 触发快照的动作

  // 游戏核心状态
  seats: Seat[]; // 所有玩家座位状态
  gameLogs: LogEntry[]; // 游戏日志
  winResult: WinResult | null; // 游戏结果
  winReason: string | null; // 胜利原因

  // 其他关键状态
  todayExecutedId: number | null; // 今日处决的玩家ID
  nominatedPlayers: Set<number>; // 今日被提名的玩家
  nominatorPlayers: Set<number>; // 今日发起提名的玩家
  nominationRecords: { nominators: Set<number>; nominees: Set<number> }; // 完整的提名记录
  deadThisNight: number[]; // 本夜死亡的玩家ID列表
  hasUsedGhostVotePlayers: Set<number>; // 已使用幽灵票的死亡玩家
}

/**
 * 快照管理器
 * 负责快照的创建、存储、查询
 */
export class HistorySnapshotManager {
  private snapshots: GameStateSnapshot[] = [];
  private maxSnapshots: number = 100; // 最大保存快照数量，防止内存溢出

  constructor(maxSnapshots: number = 100) {
    this.maxSnapshots = maxSnapshots;
  }

  /**
   * 创建并保存一个新的快照
   * @param state 游戏状态
   * @param description 快照描述
   * @param triggerAction 触发快照的动作
   * @returns 创建的快照
   */
  public createSnapshot(
    state: Omit<
      GameStateSnapshot,
      "id" | "timestamp" | "description" | "triggerAction"
    >,
    description: string,
    triggerAction?: string
  ): GameStateSnapshot {
    const snapshot: GameStateSnapshot = {
      id: this.generateSnapshotId(),
      timestamp: Date.now(),
      description,
      triggerAction,
      ...state,
      // 深拷贝状态，避免引用修改
      seats: JSON.parse(JSON.stringify(state.seats)),
      gameLogs: JSON.parse(JSON.stringify(state.gameLogs)),
      nominatedPlayers: new Set(state.nominatedPlayers),
      nominatorPlayers: new Set(state.nominatorPlayers),
      nominationRecords: {
        nominators: new Set(state.nominationRecords?.nominators || []),
        nominees: new Set(state.nominationRecords?.nominees || []),
      },
      deadThisNight: [...state.deadThisNight],
      hasUsedGhostVotePlayers: new Set(state.hasUsedGhostVotePlayers),
    };

    this.snapshots.push(snapshot);

    // 超过最大数量时删除最早的快照
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    return snapshot;
  }

  /**
   * 获取所有快照
   */
  public getAllSnapshots(): GameStateSnapshot[] {
    return [...this.snapshots];
  }

  /**
   * 根据ID获取快照
   * @param id 快照ID
   */
  public getSnapshotById(id: string): GameStateSnapshot | undefined {
    return this.snapshots.find((s) => s.id === id);
  }

  /**
   * 获取最新的快照
   */
  public getLatestSnapshot(): GameStateSnapshot | undefined {
    return this.snapshots[this.snapshots.length - 1];
  }

  /**
   * 获取指定时间之前的最近快照
   * @param timestamp 时间戳
   */
  public getSnapshotBeforeTime(
    timestamp: number
  ): GameStateSnapshot | undefined {
    for (let i = this.snapshots.length - 1; i >= 0; i--) {
      if (this.snapshots[i].timestamp <= timestamp) {
        return this.snapshots[i];
      }
    }
    return undefined;
  }

  /**
   * 获取指定阶段的所有快照
   * @param phase 游戏阶段
   */
  public getSnapshotsByPhase(phase: GamePhase): GameStateSnapshot[] {
    return this.snapshots.filter((s) => s.phase === phase);
  }

  /**
   * 获取第N个夜晚的快照
   * @param nightCount 夜晚次数（首夜为1）
   */
  public getSnapshotsByNightCount(nightCount: number): GameStateSnapshot[] {
    return this.snapshots.filter((s) => s.nightCount === nightCount);
  }

  /**
   * 获取第N个白天的快照
   * @param dayCount 白天次数（第一个白天为1）
   */
  public getSnapshotsByDayCount(dayCount: number): GameStateSnapshot[] {
    return this.snapshots.filter((s) => s.dayCount === dayCount);
  }

  /**
   * 回滚到指定快照的状态
   * @param snapshotId 快照ID
   * @returns 回滚后的状态，失败返回undefined
   */
  public rollbackToSnapshot(snapshotId: string): GameStateSnapshot | undefined {
    const snapshot = this.getSnapshotById(snapshotId);
    if (!snapshot) {
      return undefined;
    }

    // 删除该快照之后的所有快照
    const index = this.snapshots.findIndex((s) => s.id === snapshotId);
    if (index !== -1) {
      this.snapshots = this.snapshots.slice(0, index + 1);
    }

    // 返回深拷贝的快照，避免直接修改内部状态
    return JSON.parse(JSON.stringify(snapshot));
  }

  /**
   * 清空所有快照
   */
  public clear(): void {
    this.snapshots = [];
  }

  /**
   * 生成唯一快照ID
   */
  private generateSnapshotId(): string {
    return `snap_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// 全局单例
export const historySnapshotManager = new HistorySnapshotManager();

/**
 * 快照点配置
 * 定义哪些动作发生时需要创建快照
 */
export const SNAPSHOT_TRIGGERS = {
  // 阶段变更
  PHASE_CHANGE: "phase_change",

  // 玩家状态变更
  PLAYER_KILLED: "player_killed",
  PLAYER_EXECUTED: "player_executed",
  PLAYER_REVIVED: "player_revived",
  PLAYER_ROLE_CHANGED: "player_role_changed",

  // 能力使用
  ABILITY_USED: "ability_used",
  NIGHT_ACTION_COMPLETED: "night_action_completed",

  // 投票相关
  NOMINATION_MADE: "nomination_made",
  VOTING_COMPLETED: "voting_completed",

  // 游戏结束
  GAME_OVER: "game_over",
} as const;

/**
 * 从 NightLogicGameState 创建游戏状态快照
 * 用于新夜晚引擎的状态转换
 * 类型定义来自新引擎 useNightEngine（旧引擎 useNightLogic 已废弃）
 */
import type { NightLogicGameState } from "../hooks/useNightEngine";

export function createSnapshotFromGameState(
  gameState: NightLogicGameState
): GameStateSnapshot {
  // 计算白天计数（首夜后是第一天，每两个夜晚之间算一个白天）
  const dayCount = Math.max(1, gameState.nightCount);

  // 从 nominationMap 提取提名记录
  const nominators = new Set<number>();
  const nominees = new Set<number>();

  Object.entries(gameState.nominationMap || {}).forEach(
    ([nominatorId, nomineeId]) => {
      nominators.add(parseInt(nominatorId, 10));
      nominees.add(nomineeId);
    }
  );

  return {
    id: `snap_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    timestamp: Date.now(),
    phase: gameState.gamePhase,
    nightCount: gameState.nightCount,
    dayCount,
    description: `状态快照 - ${gameState.gamePhase}`,
    triggerAction: "state_sync",

    // 游戏核心状态
    seats: JSON.parse(JSON.stringify(gameState.seats)),
    gameLogs: JSON.parse(JSON.stringify(gameState.gameLogs)),
    winResult: null,
    winReason: null,

    // 其他关键状态
    todayExecutedId: gameState.todayExecutedId,
    nominatedPlayers: nominees,
    nominatorPlayers: nominators,
    nominationRecords: {
      nominators,
      nominees,
    },
    deadThisNight: [...(gameState.deadThisNight || [])],
    hasUsedGhostVotePlayers: new Set(),
  };
}
