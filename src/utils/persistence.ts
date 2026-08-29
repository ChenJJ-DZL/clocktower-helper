"use client";

import type { GameState } from "../contexts/GameContext";
import type { GameRecord, GameSnapshot } from "../types/game";

const STORAGE_KEY = "clocktower_game_records";
const SNAPSHOT_KEY = "clocktower_current_snapshot";

/**
 * 从 localStorage 加载所有游戏记录
 */
export function loadGameRecords(): GameRecord[] {
  try {
    if (typeof window === "undefined") return [];
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const records = JSON.parse(stored) as GameRecord[];
    return records;
  } catch (error) {
    console.error(
      "Failed to load game records, clearing corrupted data:",
      error
    );
    // 数据损坏时清除 localStorage 中的记录
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    return [];
  }
}

/**
 * 保存一条游戏记录到 localStorage
 */
export function saveGameRecord(record: GameRecord): void {
  try {
    if (typeof window === "undefined") return;
    const records = loadGameRecords();
    // 如果已存在相同 ID 的记录，替换它
    const existingIndex = records.findIndex((r) => r.id === record.id);
    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.unshift(record);
    }
    // 🔧 限长 30 条，避免 localStorage 配额溢出（QuotaExceededError）
    if (records.length > 30) records.length = 30;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    console.error("Failed to save game record:", error);
  }
}

/**
 * 删除一条游戏记录
 */
export function deleteGameRecord(recordId: string): void {
  try {
    if (typeof window === "undefined") return;
    const records = loadGameRecords();
    const filtered = records.filter((r) => r.id !== recordId);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("Failed to delete game record:", error);
  }
}

/**
 * 从 GameState 生成 GameSnapshot
 */
/**
 * 安全深拷贝：值为 undefined/null 时原样返回，避免 JSON.parse('undefined') 抛错
 */
function safeJsonClone(value: unknown): any {
  if (value === undefined || value === null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

export function createSnapshotFromState(state: GameState): GameSnapshot {
  return {
    gamePhase: state.gamePhase,
    nightCount: state.nightCount,
    deadThisNight: [...state.deadThisNight],
    executedPlayerId: state.executedPlayerId,
    wakeQueueIds: [...state.wakeQueueIds],
    currentWakeIndex: state.currentWakeIndex,
    selectedActionTargets: [...state.selectedActionTargets],
    currentHint: state.currentHint
      ? safeJsonClone(state.currentHint)
      : state.currentHint,
    inspectionResult: state.inspectionResult,
    inspectionResultKey: state.inspectionResultKey,
    todayDemonVoted: state.todayDemonVoted,
    todayMinionNominated: state.todayMinionNominated,
    todayExecutedId: state.todayExecutedId,
    witchCursedId: state.witchCursedId,
    witchActive: state.witchActive,
    cerenovusTarget: state.cerenovusTarget
      ? { ...state.cerenovusTarget }
      : null,
    isVortoxWorld: state.isVortoxWorld,
    fangGuConverted: state.fangGuConverted,
    jugglerGuesses: safeJsonClone(state.jugglerGuesses),
    evilTwinPair: state.evilTwinPair ? { ...state.evilTwinPair } : null,
    outsiderDiedToday: state.outsiderDiedToday,
    gossipStatementToday: state.gossipStatementToday,
    gossipTrueTonight: state.gossipTrueTonight,
    gossipSourceSeatId: state.gossipSourceSeatId,
    timer: state.timer,
    startTime: state.startTime ? state.startTime.toISOString() : null,
    selectedRole: state.selectedRole,
    spyDisguiseMode: state.spyDisguiseMode,
    spyDisguiseProbability: state.spyDisguiseProbability,
    poppyGrowerDead: state.poppyGrowerDead,
    pukkaPoisonQueue: safeJsonClone(state.pukkaPoisonQueue),
    poChargeState: { ...state.poChargeState },
    usedOnceAbilities: safeJsonClone(state.usedOnceAbilities),
    usedDailyAbilities: safeJsonClone(state.usedDailyAbilities),
    balloonistKnownTypes: JSON.parse(
      JSON.stringify(state.balloonistKnownTypes)
    ),
    hasExecutedThisDay: state.hasExecutedThisDay,
    votedThisRound: [...state.votedThisRound],
    lastDuskExecution: state.lastDuskExecution,
    currentDuskExecution: state.currentDuskExecution,
    history: safeJsonClone(state.history),
    historyIndex: state.historyIndex ?? -1,
    reminderTokens: safeJsonClone(state.reminderTokens ?? {}),
    seats: safeJsonClone(state.seats),
    initialSeats: safeJsonClone(state.initialSeats),
    victorySnapshot: safeJsonClone(state.victorySnapshot),
    winResult: state.winResult,
    winReason: state.winReason,
    mayorRedirectTarget: state.mayorRedirectTarget,
    damselGuessed: state.damselGuessed,
    damselGuessUsedBy: [...state.damselGuessUsedBy],
    klutzChoiceTarget: state.klutzChoiceTarget,
    shamanKeyword: state.shamanKeyword,
    shamanTriggered: state.shamanTriggered,
    shamanConvertTarget: state.shamanConvertTarget,
    autoRedHerringInfo: state.autoRedHerringInfo,
    dayAbilityLogs: safeJsonClone(state.dayAbilityLogs),
    nominationMap: { ...state.nominationMap },
    nominationRecords: {
      nominators: Array.from(state.nominationRecords?.nominators || []),
      nominees: Array.from(state.nominationRecords?.nominees || []),
    },
    mastermindFinalDay: state.mastermindFinalDay
      ? { ...state.mastermindFinalDay }
      : null,
    remainingDays: state.remainingDays,
    goonDrunkedThisNight: state.goonDrunkedThisNight,
    hadesiaChoices: { ...state.hadesiaChoices },
    virginGuideInfo: state.virginGuideInfo,
    voteRecords: safeJsonClone(state.voteRecords),
    seatNotes: { ...state.seatNotes },
    hadesiaChoiceEnabled: state.hadesiaChoiceEnabled,
    lastExecutedPlayerId: state.lastExecutedPlayerId,
    fangGuConvertedSeatId: null,
    selectedScript: state.selectedScript
      ? safeJsonClone(state.selectedScript)
      : null,
    scriptId: state.selectedScript?.id,
    scriptName: state.selectedScript?.name,
  };
}

/**
 * 判断一个快照是否是真正意义上的“未完成进行中对局”
 * 排除 setup, check, scriptSelection, gameOver, 以及未分配角色的空桌
 */
export function isRealUnfinishedGame(snapshot: GameSnapshot | null): boolean {
  if (!snapshot) return false;
  // 排除非实质游戏流程阶段
  const nonGamePhases = ["scriptSelection", "setup", "check", "gameOver"];
  if (!snapshot.gamePhase || nonGamePhases.includes(snapshot.gamePhase)) {
    return false;
  }
  // 排除已分胜负的已结束对局
  if (snapshot.winResult) return false;
  // 必须有座位且已分配角色
  if (!snapshot.seats || snapshot.seats.length === 0) return false;
  const hasAssignedRoles = snapshot.seats.some((s: any) => s.role?.id);
  if (!hasAssignedRoles) return false;
  return true;
}

/**
 * 保存当前游戏快照到 localStorage（用于意外关闭后恢复）
 */
export function saveCurrentSnapshot(snapshot: GameSnapshot): void {
  try {
    if (typeof window === "undefined") return;
    // 🔧 截断 history 只保留最近 5 条轻量记录，避免深层历史递归膨胀溢出 localStorage 配额
    const slim = {
      ...snapshot,
      history: Array.isArray(snapshot.history)
        ? snapshot.history.slice(-5).map((h) => ({
            ...h,
            history: [],
          }))
        : [],
    };
    try {
      window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(slim));
    } catch (innerError: any) {
      if (
        innerError?.name === "QuotaExceededError" ||
        innerError?.code === 22 ||
        innerError?.code === 1014
      ) {
        // 配额超限兜底：清理历史记录与多余日志，只保存纯净当前状态
        const minimal = {
          ...slim,
          history: [],
          dayAbilityLogs: [],
        };
        // 清理过期的游戏档案
        const records = loadGameRecords();
        if (records.length > 5) {
          try {
            window.localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify(records.slice(0, 5))
            );
          } catch {}
        }
        window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(minimal));
      } else {
        throw innerError;
      }
    }
  } catch (error) {
    console.warn("Failed to save current snapshot:", error);
  }
}

/**
 * 从 localStorage 加载当前游戏快照
 */
export function loadCurrentSnapshot(): GameSnapshot | null {
  try {
    if (typeof window === "undefined") return null;
    const stored = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!stored) return null;
    const snapshot = JSON.parse(stored) as GameSnapshot;
    return snapshot;
  } catch (error) {
    console.error(
      "Failed to load current snapshot, clearing corrupted data:",
      error
    );
    // 数据损坏时清除 localStorage 中的快照
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SNAPSHOT_KEY);
    }
    return null;
  }
}

/**
 * 清除当前游戏快照
 */
export function clearCurrentSnapshot(): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(SNAPSHOT_KEY);
  } catch (error) {
    console.error("Failed to clear current snapshot:", error);
  }
}

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
