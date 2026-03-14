import { useMemo } from "react";
import type { GamePhase, LogEntry, WinResult } from "@/app/data";
import { gameActions, useGameContext } from "../contexts/GameContext";

export function useVillageState() {
  const { state, dispatch } = useGameContext();
  const { gamePhase, nightCount, timer, gameLogs, winResult, winReason } =
    state;

  return useMemo(
    () => ({
      gamePhase,
      setGamePhase: (val: GamePhase | ((prev: GamePhase) => GamePhase)) => {
        const next = typeof val === "function" ? val(state.gamePhase) : val;
        dispatch(gameActions.setGamePhase(next));
      },
      nightCount,
      setNightCount: (val: number | ((prev: number) => number)) => {
        const next = typeof val === "function" ? val(state.nightCount) : val;
        dispatch(gameActions.updateState({ nightCount: next }));
      },
      timer,
      setTimer: (val: number | ((prev: number) => number)) => {
        const next = typeof val === "function" ? val(state.timer) : val;
        dispatch(gameActions.setTimer(next));
      },
      // timer running state is handled in useGameFlow or separately, keeping compatibility
      isTimerRunning: true,
      setIsTimerRunning: () => {},
      gameLogs,
      setGameLogs: (logs: LogEntry[] | ((prev: LogEntry[]) => LogEntry[])) => {
        const next = typeof logs === "function" ? logs(state.gameLogs) : logs;
        dispatch(gameActions.updateState({ gameLogs: next }));
      },
      winResult,
      setWinResult: (val: WinResult | ((prev: WinResult) => WinResult)) => {
        const next = typeof val === "function" ? val(state.winResult) : val;
        dispatch(gameActions.setWinResult(next, state.winReason));
      },
      winReason: winReason || "",
      setWinReason: (
        val: string | ((prev: string | null) => string | null)
      ) => {
        const next =
          typeof val === "function" ? val(state.winReason) || "" : val;
        dispatch(gameActions.setWinResult(state.winResult, next));
      },
    }),
    [
      state,
      dispatch,
      gamePhase,
      nightCount,
      timer,
      gameLogs,
      winResult,
      winReason,
    ]
  );
}
