import { useState } from 'react';
import { GamePhase, WinResult, LogEntry } from '@/app/data';

export function useVillageState() {
    const [gamePhase, setGamePhase] = useState<GamePhase>("setup");
    const [nightCount, setNightCount] = useState(0);
    const [timer, setTimer] = useState(0);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [gameLogs, setGameLogs] = useState<LogEntry[]>([]);
    const [winResult, setWinResult] = useState<WinResult>(null);
    const [winReason, setWinReason] = useState("");

    return {
        gamePhase, setGamePhase,
        nightCount, setNightCount,
        timer, setTimer,
        isTimerRunning, setIsTimerRunning,
        gameLogs, setGameLogs,
        winResult, setWinResult,
        winReason, setWinReason,
    };
}
