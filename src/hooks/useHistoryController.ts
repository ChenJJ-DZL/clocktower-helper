"use client";

import { useCallback, useMemo } from "react";
import { gameActions, useGameContext } from "../contexts/GameContext";

/**
 * UseHistoryControllerResult - 历史记录管理 Hook 的返回结果
 */
export interface UseHistoryControllerResult {
  saveHistory: () => void;
  handleStepBack: () => void;
  handleGlobalUndo: () => void;
  /** ↪ 重做（Redo）：恢复被撤销的操作 */
  handleRedo: () => void;
  /** 当前是否可以撤销 */
  canUndo: boolean;
  /** 当前是否可以重做 */
  canRedo: boolean;
}

/**
 * 快照字段列表：所有需要在 undo/redo 时恢复的状态字段
 */
const SNAPSHOT_KEYS = [
  "seats",
  "gamePhase",
  "nightCount",
  "executedPlayerId",
  "wakeQueueIds",
  "currentWakeIndex",
  "selectedActionTargets",
  "gameLogs",
  "currentHint",
  "selectedScript",
  "reminderTokens",
  "todayExecutedId",
  "nominationRecords",
  "deadThisNight",
  "nightActionQueue",
] as const;

/**
 * 从快照对象恢复状态到 dispatch
 */
function restoreSnapshot(snapshot: any) {
  const updates: Record<string, any> = {};
  for (const key of SNAPSHOT_KEYS) {
    if (snapshot[key] !== undefined) {
      updates[key] = snapshot[key];
    }
  }
  // nominationRecords 的 nominators/nominees 从数组恢复为 Set
  if (updates.nominationRecords) {
    const nr = updates.nominationRecords;
    updates.nominationRecords = {
      nominators: new Set(Array.isArray(nr.nominators) ? nr.nominators : []),
      nominees: new Set(Array.isArray(nr.nominees) ? nr.nominees : []),
    };
  }
  return updates;
}

/**
 * useHistoryController - 历史记录管理 Hook（Undo/Redo）
 *
 * 核心变更（W8.18.4）：
 * - 从线性栈（pop-and-discard）改为时间线+指针（historyIndex）。
 * - saveHistory：追加快照，截断后续历史，指针指向末尾。
 * - handleUndo：指针回退，恢复快照（不删除条目）。
 * - handleRedo：指针前进，恢复快照。
 * - 新操作后截断 forward history（标准 undo 行为）。
 */
export function useHistoryController(): UseHistoryControllerResult {
  const { state, dispatch } = useGameContext();
  const { history, historyIndex, currentWakeIndex, gamePhase } = state;

  const canUndo = history.length > 0 && historyIndex >= 0;
  const canRedo = history.length > 0 && historyIndex < history.length - 1;

  const saveHistory = useCallback(() => {
    const snapshot: Record<string, any> = {
      seats: state.seats
        ? JSON.parse(JSON.stringify(state.seats))
        : state.seats,
      gamePhase: state.gamePhase,
      nightCount: state.nightCount,
      executedPlayerId: state.executedPlayerId,
      wakeQueueIds: [...(state.wakeQueueIds || [])],
      currentWakeIndex: state.currentWakeIndex,
      selectedActionTargets: [...(state.selectedActionTargets || [])],
      gameLogs: [...(state.gameLogs || [])],
      currentHint: state.currentHint
        ? JSON.parse(JSON.stringify(state.currentHint))
        : state.currentHint,
      selectedScript: state.selectedScript,
      reminderTokens: state.reminderTokens
        ? JSON.parse(JSON.stringify(state.reminderTokens))
        : state.reminderTokens,
      todayExecutedId: state.todayExecutedId ?? null,
      nominationRecords: state.nominationRecords
        ? {
            nominators: [...(state.nominationRecords.nominators || [])],
            nominees: [...(state.nominationRecords.nominees || [])],
          }
        : state.nominationRecords,
      deadThisNight: [...(state.deadThisNight || [])],
      nightActionQueue: state.nightActionQueue
        ? JSON.parse(JSON.stringify(state.nightActionQueue))
        : state.nightActionQueue,
    };

    // 截断 forward history（undo 后执行新操作 → 丢弃被撤销的未来）
    const truncated =
      historyIndex >= 0 ? history.slice(0, historyIndex + 1) : history;

    const newHistory = [...truncated, snapshot].slice(-200);
    dispatch(
      gameActions.updateState({
        history: newHistory,
        historyIndex: newHistory.length - 1,
      })
    );
  }, [state, history, historyIndex, dispatch]);

  const handleStepBack = useCallback(() => {
    // 没有历史记录时，在队列内后退一步
    if (!canUndo) {
      if (currentWakeIndex > 0) {
        dispatch(
          gameActions.updateState({
            currentWakeIndex: currentWakeIndex - 1,
            selectedActionTargets: [],
            inspectionResult: null,
          })
        );
      }
      return;
    }

    const newIndex = historyIndex - 1;
    const snapshot = history[newIndex];
    if (!snapshot || snapshot.wakeQueueIds?.length === 0) return;

    dispatch(
      gameActions.updateState({
        ...restoreSnapshot(snapshot),
        historyIndex: newIndex,
      })
    );
  }, [canUndo, currentWakeIndex, history, historyIndex, dispatch]);

  const handleGlobalUndo = useCallback(() => {
    if (gamePhase === "scriptSelection") return;

    if (!canUndo) {
      // 没有任何历史时，重置到剧本选择阶段
      dispatch(gameActions.setGamePhase("scriptSelection"));
      dispatch(
        gameActions.updateState({
          selectedScript: null,
          nightCount: 1,
          executedPlayerId: null,
          wakeQueueIds: [],
          currentWakeIndex: 0,
          selectedActionTargets: [],
          gameLogs: [],
          winResult: null,
          winReason: null,
          deadThisNight: [],
          selectedRole: null,
          inspectionResult: null,
          currentHint: { isPoisoned: false, guide: "", speak: "" },
          timer: 0,
          startTime: null,
          history: [],
          historyIndex: -1,
          initialSeats: [],
        })
      );
      return;
    }

    const newIndex = historyIndex - 1;
    const snapshot = history[newIndex];
    dispatch(
      gameActions.updateState({
        ...restoreSnapshot(snapshot),
        historyIndex: newIndex,
      })
    );
  }, [gamePhase, canUndo, history, historyIndex, dispatch]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;

    const newIndex = historyIndex + 1;
    const snapshot = history[newIndex];
    if (!snapshot) return;

    dispatch(
      gameActions.updateState({
        ...restoreSnapshot(snapshot),
        historyIndex: newIndex,
      })
    );
  }, [canRedo, history, historyIndex, dispatch]);

  return useMemo(
    () => ({
      saveHistory,
      handleStepBack,
      handleGlobalUndo,
      handleRedo,
      canUndo,
      canRedo,
    }),
    [
      saveHistory,
      handleStepBack,
      handleGlobalUndo,
      handleRedo,
      canUndo,
      canRedo,
    ]
  );
}
