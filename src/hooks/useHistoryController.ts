"use client";

import { useCallback, useMemo } from 'react';
import { useGameContext, gameActions } from "../contexts/GameContext";

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
    const snapshot = {
      seats: JSON.parse(JSON.stringify(state.seats)),
      gamePhase: state.gamePhase,
      nightCount: state.nightCount,
      executedPlayerId: state.executedPlayerId,
      wakeQueueIds: [...state.wakeQueueIds],
      currentWakeIndex: state.currentWakeIndex,
      selectedActionTargets: [...state.selectedActionTargets],
      gameLogs: [...state.gameLogs],
      currentHint: JSON.parse(JSON.stringify(state.currentHint)),
      selectedScript: state.selectedScript,
    };

    dispatch(gameActions.updateState({
      history: [...state.history, snapshot]
    }));
  }, [state, dispatch]);

  const handleStepBack = useCallback(() => {
    if (currentWakeIndex > 0) {
      dispatch(gameActions.updateState({ currentWakeIndex: currentWakeIndex - 1 }));
      return;
    }

    if (history.length === 0) return;

    const lastState = history[history.length - 1];
    if (lastState.gamePhase !== gamePhase || lastState.wakeQueueIds.length === 0) return;

    dispatch(gameActions.updateState({
      seats: lastState.seats,
      gamePhase: lastState.gamePhase,
      nightCount: lastState.nightCount,
      executedPlayerId: lastState.executedPlayerId,
      wakeQueueIds: lastState.wakeQueueIds,
      currentWakeIndex: Math.max(0, lastState.wakeQueueIds.length - 1),
      selectedActionTargets: lastState.selectedActionTargets,
      gameLogs: lastState.gameLogs,
      history: history.slice(0, -1)
    }));
  }, [currentWakeIndex, gamePhase, history, dispatch]);

  const handleGlobalUndo = useCallback(() => {
    if (gamePhase === 'scriptSelection') return;

    if (history.length === 0) {
      // 没有任何历史时，直接重置到剧本选择阶段
      dispatch(gameActions.setGamePhase('scriptSelection'));
      dispatch(gameActions.updateState({
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
        initialSeats: []
      }));
      return;
    }

    const lastState = history[history.length - 1];
    dispatch(gameActions.updateState({
      seats: lastState.seats,
      gamePhase: lastState.gamePhase,
      nightCount: lastState.nightCount,
      executedPlayerId: lastState.executedPlayerId,
      wakeQueueIds: lastState.wakeQueueIds,
      currentWakeIndex: lastState.currentWakeIndex,
      selectedActionTargets: lastState.selectedActionTargets,
      gameLogs: lastState.gameLogs,
      selectedScript: lastState.selectedScript,
      history: history.slice(0, -1)
    }));
  }, [gamePhase, history, dispatch]);

  return useMemo(() => ({
    saveHistory,
    handleStepBack,
    handleGlobalUndo,
  }), [saveHistory, handleStepBack, handleGlobalUndo]);
}
