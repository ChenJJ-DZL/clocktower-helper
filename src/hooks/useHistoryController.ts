import { Dispatch, MutableRefObject, SetStateAction, useCallback, useEffect } from 'react';

interface HistoryState {
  history: any[];
  setHistory: Dispatch<SetStateAction<any[]>>;
}

interface HistoryDeps {
  gameStateRef: MutableRefObject<any>;
  currentHint: any;
  setCurrentHint: Dispatch<SetStateAction<any>>;
  currentWakeIndex: number;
  setCurrentWakeIndex: Dispatch<SetStateAction<number>>;
  gamePhase: any;
  setGamePhase: Dispatch<SetStateAction<any>>;
  setNightCount: Dispatch<SetStateAction<number>>;
  setExecutedPlayerId: Dispatch<SetStateAction<number | null>>;
  setWakeQueueIds: Dispatch<SetStateAction<any[]>>;
  setSelectedActionTargets: Dispatch<SetStateAction<any[]>>;
  setGameLogs: Dispatch<SetStateAction<any[]>>;
  setSelectedScript: Dispatch<SetStateAction<any | null>>;
  setWinResult: Dispatch<SetStateAction<any>>;
  setWinReason: Dispatch<SetStateAction<any>>;
  setDeadThisNight: Dispatch<SetStateAction<any[]>>;
  setSelectedRole: Dispatch<SetStateAction<any>>;
  setInspectionResult: Dispatch<SetStateAction<any>>;
  setTimer: Dispatch<SetStateAction<number>>;
  setStartTime: Dispatch<SetStateAction<number | null>>;
  setSeats: Dispatch<SetStateAction<any[]>>;
  setInitialSeats: Dispatch<SetStateAction<any[]>>;
  hintCacheRef: MutableRefObject<Map<any, any>>;
  drunkFirstInfoRef: MutableRefObject<Map<any, any>>;
  saveHistoryRef?: MutableRefObject<(() => void) | null>;
}

interface HistoryControllerResult {
  saveHistory: () => void;
  handleStepBack: () => void;
  handleGlobalUndo: () => void;
}

export function useHistoryController(base: HistoryState, deps: HistoryDeps): HistoryControllerResult {
  const { history, setHistory } = base;
  const {
    gameStateRef,
    currentHint,
    setCurrentHint,
    currentWakeIndex,
    setCurrentWakeIndex,
    gamePhase,
    setGamePhase,
    setNightCount,
    setExecutedPlayerId,
    setWakeQueueIds,
    setSelectedActionTargets,
    setGameLogs,
    setSelectedScript,
    setWinResult,
    setWinReason,
    setDeadThisNight,
    setSelectedRole,
    setInspectionResult,
    setTimer,
    setStartTime,
    setSeats,
    setInitialSeats,
    hintCacheRef,
    drunkFirstInfoRef,
    saveHistoryRef,
  } = deps;

  const saveHistory = useCallback(() => {
    const state = gameStateRef.current;
    setHistory(prev => [
      ...prev,
      {
        seats: JSON.parse(JSON.stringify(state.seats)),
        gamePhase: state.gamePhase,
        nightCount: state.nightCount,
        executedPlayerId: state.executedPlayerId,
        wakeQueueIds: [...state.wakeQueueIds],
        currentWakeIndex: state.currentWakeIndex,
        selectedActionTargets: [...state.selectedActionTargets],
        gameLogs: [...state.gameLogs],
        currentHint: JSON.parse(JSON.stringify(currentHint)),
        selectedScript: state.selectedScript,
      },
    ]);
  }, [currentHint, gameStateRef, setHistory]);

  useEffect(() => {
    if (saveHistoryRef) {
      saveHistoryRef.current = saveHistory;
    }
  }, [saveHistory, saveHistoryRef]);

  const handleStepBack = useCallback(() => {
    if (currentWakeIndex > 0) {
      setCurrentWakeIndex(currentWakeIndex - 1);
      return;
    }

    if (history.length === 0) return;

    const lastState = history[history.length - 1];
    if (lastState.gamePhase !== gamePhase || lastState.wakeQueueIds.length === 0) return;

    setSeats(lastState.seats);
    setGamePhase(lastState.gamePhase);
    setNightCount(lastState.nightCount);
    setExecutedPlayerId(lastState.executedPlayerId);
    setWakeQueueIds(lastState.wakeQueueIds);
    setCurrentWakeIndex(Math.max(0, lastState.wakeQueueIds.length - 1));
    setSelectedActionTargets(lastState.selectedActionTargets);
    setGameLogs(lastState.gameLogs);
    setHistory(prev => prev.slice(0, -1));
  }, [
    currentWakeIndex,
    gamePhase,
    history,
    setCurrentWakeIndex,
    setExecutedPlayerId,
    setGameLogs,
    setGamePhase,
    setHistory,
    setNightCount,
    setSeats,
    setSelectedActionTargets,
    setWakeQueueIds,
  ]);

  const handleGlobalUndo = useCallback(() => {
    if (gamePhase === 'scriptSelection') {
      return;
    }

    if (history.length === 0) {
      setGamePhase('scriptSelection');
      setSelectedScript(null);
      setNightCount(1);
      setExecutedPlayerId(null);
      setWakeQueueIds([]);
      setCurrentWakeIndex(0);
      setSelectedActionTargets([]);
      setGameLogs([]);
      setWinResult(null);
      setWinReason(null);
      setDeadThisNight([]);
      setSelectedRole(null);
      setInspectionResult(null);
      setCurrentHint({ isPoisoned: false, guide: "", speak: "" });
      setTimer(0);
      setStartTime(null);
      hintCacheRef.current.clear();
      drunkFirstInfoRef.current.clear();
      setSeats(
        Array.from({ length: 15 }, (_, i) => ({
          id: i,
          role: null,
          charadeRole: null,
          isDead: false,
          isDrunk: false,
          isPoisoned: false,
          isProtected: false,
          protectedBy: null,
          isRedHerring: false,
          isFortuneTellerRedHerring: false,
          isSentenced: false,
          masterId: null,
          hasUsedSlayerAbility: false,
          hasUsedDayAbility: false,
          hasUsedVirginAbility: false,
          isDemonSuccessor: false,
          hasAbilityEvenDead: false,
          statusDetails: [],
          statuses: [],
          grandchildId: null,
          isGrandchild: false,
          zombuulLives: 1,
        }))
      );
      setInitialSeats([]);
      return;
    }

    const lastState = history[history.length - 1];
    setSeats(lastState.seats);
    setGamePhase(lastState.gamePhase);
    setNightCount(lastState.nightCount);
    setExecutedPlayerId(lastState.executedPlayerId);
    setWakeQueueIds(lastState.wakeQueueIds);
    setCurrentWakeIndex(lastState.currentWakeIndex);
    setSelectedActionTargets(lastState.selectedActionTargets);
    setGameLogs(lastState.gameLogs);
    setSelectedScript(lastState.selectedScript);
    hintCacheRef.current.clear();
    setHistory(prev => prev.slice(0, -1));
  }, [
    drunkFirstInfoRef,
    gamePhase,
    hintCacheRef,
    history,
    setCurrentHint,
    setCurrentWakeIndex,
    setDeadThisNight,
    setExecutedPlayerId,
    setGameLogs,
    setGamePhase,
    setHistory,
    setInitialSeats,
    setInspectionResult,
    setNightCount,
    setSelectedActionTargets,
    setSelectedRole,
    setSelectedScript,
    setSeats,
    setStartTime,
    setTimer,
    setWakeQueueIds,
    setWinReason,
    setWinResult,
  ]);

  return {
    saveHistory,
    handleStepBack,
    handleGlobalUndo,
  };
}

