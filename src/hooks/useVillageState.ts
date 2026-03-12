import { useMemo } from 'react';
import { useGameContext, gameActions } from '../contexts/GameContext';
import { GamePhase, WinResult, LogEntry } from '@/app/data';

export function useVillageState() {
    const { state, dispatch } = useGameContext();
    const { gamePhase, nightCount, timer, gameLogs, winResult, winReason } = state;

    return useMemo(() => ({
        gamePhase,
        setGamePhase: (phase: GamePhase) => dispatch(gameActions.setGamePhase(phase)),
        nightCount,
        setNightCount: (count: number) => dispatch(gameActions.updateState({ nightCount: count })),
        timer,
        setTimer: (t: number) => dispatch(gameActions.setTimer(t)),
        // timer running state is handled in useGameFlow or separately, keeping compatibility
        isTimerRunning: true, 
        setIsTimerRunning: () => {}, 
        gameLogs,
        setGameLogs: (logs: LogEntry[] | ((prev: LogEntry[]) => LogEntry[])) => {
            const next = typeof logs === 'function' ? logs(state.gameLogs) : logs;
            dispatch(gameActions.updateState({ gameLogs: next }));
        },
        winResult,
        setWinResult: (res: WinResult) => dispatch(gameActions.setWinResult(res, state.winReason)),
        winReason: winReason || "",
        setWinReason: (reason: string) => dispatch(gameActions.setWinResult(state.winResult, reason)),
    }), [state, dispatch, gamePhase, nightCount, timer, gameLogs, winResult, winReason]);
}
