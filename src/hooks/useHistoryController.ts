"use client";

import { useCallback, useMemo } from "react";
import type { GameState } from "../contexts/GameContext";
import { gameActions, useGameContext } from "../contexts/GameContext";
import {
  createSnapshot,
  restoreSnapshot,
  SNAPSHOT_KEYS,
} from "../utils/undoSnapshot";

export { createSnapshot, restoreSnapshot, SNAPSHOT_KEYS };

/**
 * UseHistoryControllerResult - 历史记录管理 Hook 的返回结果
 */
export interface UseHistoryControllerResult {
  saveHistory: (overrideState?: Partial<GameState>) => void;
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
 * useHistoryController - 精准单动作级历史记录管理 Hook（Undo/Redo）
 *
 * 核心机制：
 * - 每一个点击操作（技能发动、换座位、提名投票、入夜/天亮推进等）均保存一个动作快照。
 * - canUndo：history.length > 0 && historyIndex > 0（0 对应落座阶段初始空座位态）。
 * - 撤销只回退上一个原子动作，支持连续撤销直达游戏开始前的落座阶段（空座位）。
 */
export function useHistoryController(): UseHistoryControllerResult {
  const { state, dispatch } = useGameContext();
  const { history, historyIndex, currentWakeIndex } = state;

  // 只要历史指针大于 0 即可撤销（0 对应空座位阶段，不能继续再往前撤销）
  const canUndo = history.length > 0 && historyIndex > 0;
  // 只要指针未达末尾即可重做
  const canRedo = history.length > 0 && historyIndex < history.length - 1;

  const saveHistory = useCallback(
    (overrideState?: Partial<GameState>) => {
      const baseState = { ...state, ...(overrideState || {}) };
      const snapshot = createSnapshot(baseState);

      let newHistory: any[];
      let newIndex: number;

      if (history.length === 0 || historyIndex === -1) {
        newHistory = [snapshot];
        newIndex = 0;
      } else {
        // 截断 forward history 并追加新原子快照
        const truncated = history.slice(0, historyIndex + 1);
        newHistory = [...truncated, snapshot].slice(-300);
        newIndex = newHistory.length - 1;
      }

      dispatch(
        gameActions.updateState({
          history: newHistory,
          historyIndex: newIndex,
        })
      );
    },
    [state, history, historyIndex, dispatch]
  );

  const handleStepBack = useCallback(() => {
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

    const targetIndex = historyIndex - 1;
    const snapshot = history[targetIndex];
    if (!snapshot) return;

    dispatch(
      gameActions.updateState({
        ...restoreSnapshot(snapshot),
        historyIndex: targetIndex,
      })
    );
  }, [canUndo, currentWakeIndex, history, historyIndex, dispatch]);

  const handleGlobalUndo = useCallback(() => {
    if (!canUndo || historyIndex <= 0) return;

    const targetIndex = historyIndex - 1;
    const snapshot = history[targetIndex];
    if (!snapshot) return;

    dispatch(
      gameActions.updateState({
        ...restoreSnapshot(snapshot),
        historyIndex: targetIndex,
      })
    );
  }, [canUndo, history, historyIndex, dispatch]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;

    const targetIndex = historyIndex + 1;
    const snapshot = history[targetIndex];
    if (!snapshot) return;

    dispatch(
      gameActions.updateState({
        ...restoreSnapshot(snapshot),
        historyIndex: targetIndex,
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
