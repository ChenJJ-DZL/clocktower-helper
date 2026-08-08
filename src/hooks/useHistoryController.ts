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
}

/**
 * useHistoryController - 历史记录管理 Hook
 * 现已重构为原生使用 GameContext
 */
export function useHistoryController(): UseHistoryControllerResult {
  const { state, dispatch } = useGameContext();
  const { history, currentWakeIndex, gamePhase } = state;

  const saveHistory = useCallback(() => {
    // 取得当前状态的一个快照（除去 history 自身）
    // 🔧 防御：JSON.stringify(undefined) 返回 undefined，再 JSON.parse 会抛
    // "undefined is not valid JSON"；值为空时直接保留，避免历史保存中断
    const snapshot = {
      seats: state.seats ? JSON.parse(JSON.stringify(state.seats)) : state.seats,
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
    };

    dispatch(
      gameActions.updateState({
        // 🔧 限长 200 条，避免 localStorage 配额溢出（QuotaExceededError）
        history: [...state.history, snapshot].slice(-200),
      })
    );
  }, [state, dispatch]);

  const handleStepBack = useCallback(() => {
    // 优先从历史快照恢复（每个 action 执行前都保存了完整快照）
    if (history.length === 0) {
      // 没有历史记录时，仅在队列内后退一步（不恢复状态）
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

    const lastState = history[history.length - 1];
    if (lastState.wakeQueueIds.length === 0) return;

    dispatch(
      gameActions.updateState({
        seats: lastState.seats,
        gamePhase: lastState.gamePhase,
        nightCount: lastState.nightCount,
        executedPlayerId: lastState.executedPlayerId,
        wakeQueueIds: lastState.wakeQueueIds,
        currentWakeIndex: lastState.currentWakeIndex,
        selectedActionTargets: lastState.selectedActionTargets,
        gameLogs: lastState.gameLogs,
        currentHint: lastState.currentHint,
        selectedScript: lastState.selectedScript,
        history: history.slice(0, -1),
      })
    );
  }, [currentWakeIndex, history, dispatch]);

  const handleGlobalUndo = useCallback(() => {
    if (gamePhase === "scriptSelection") return;

    if (history.length === 0) {
      // 没有任何历史时，直接重置到剧本选择阶段
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
          initialSeats: [],
        })
      );
      return;
    }

    const lastState = history[history.length - 1];
    dispatch(
      gameActions.updateState({
        seats: lastState.seats,
        gamePhase: lastState.gamePhase,
        nightCount: lastState.nightCount,
        executedPlayerId: lastState.executedPlayerId,
        wakeQueueIds: lastState.wakeQueueIds,
        currentWakeIndex: lastState.currentWakeIndex,
        selectedActionTargets: lastState.selectedActionTargets,
        gameLogs: lastState.gameLogs,
        selectedScript: lastState.selectedScript,
        history: history.slice(0, -1),
      })
    );
  }, [gamePhase, history, dispatch]);

  return useMemo(
    () => ({
      saveHistory,
      handleStepBack,
      handleGlobalUndo,
    }),
    [saveHistory, handleStepBack, handleGlobalUndo]
  );
}
