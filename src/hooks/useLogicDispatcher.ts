import { useCallback, useRef } from 'react';
import { Seat, GamePhase } from '@/app/data';
import { processGameEvent, GameAction } from '@/app/gameLogic';
import { computeIsPoisoned } from '../utils/gameRules';

export function useLogicDispatcher(
    seats: Seat[],
    setSeats: (s: Seat[]) => void,
    gamePhase: GamePhase,
    setGamePhase: (p: GamePhase) => void,
    addLog: (msg: string) => void,
    setWinResult: (r: 'good' | 'evil' | null) => void,
    setWinReason: (reason: string) => void,
    setCurrentModal: (m: any) => void,
    setExecutedPlayerId: (id: number | null) => void,
    setTodayExecutedId: (id: number | null) => void,
    setCurrentDuskExecution: (id: number | null) => void,
    setHasExecutedThisDay: (b: boolean) => void,
    isVortoxWorld: boolean,
    setVictorySnapshot: (seats: Seat[]) => void
) {
    const victoryRef = useRef<{ winner: 'good' | 'evil'; reason: string } | null>(null);

    const logicDispatch = useCallback((action: GameAction) => {
        if (victoryRef.current && action.type !== 'CHECK_GAME_OVER') {
            console.warn("Game already over. Ignoring action:", action.type);
            return;
        }

        const snapshot = processGameEvent(seats, gamePhase, action);

        if (snapshot.logs.length > 0) {
            snapshot.logs.forEach(msg => addLog(msg));
        }

        setSeats(snapshot.seats);

        if (snapshot.winner) {
            const w = snapshot.winner === 'Good' ? 'good' : 'evil';
            const reason = snapshot.winReason || '未知原因';
            victoryRef.current = { winner: w, reason };
            setWinResult(w);
            setWinReason(reason);
            setGamePhase('gameOver');
            // 冻结此时的座位状态作为复盘快照（只保留有角色的座位）
            setVictorySnapshot(snapshot.seats.filter(s => s.role));
            setCurrentModal({ type: 'GAME_OVER', data: null });
        }

        if (!victoryRef.current) {
            if (snapshot.nextActionHint === 'BARBER_SWAP_NEEDED') {
                const demon = snapshot.seats.find(s => (s.role?.type === 'demon' || s.isDemonSuccessor) && !s.isDead);
                if (demon) {
                    setCurrentModal({ type: 'BARBER_SWAP', data: { demonId: demon.id, firstId: null, secondId: null } });
                }
            }
        }

        if (action.type === 'EXECUTE_PLAYER') {
            setExecutedPlayerId(action.targetId);
            setTodayExecutedId(action.targetId);
            setCurrentDuskExecution(action.targetId);
            setHasExecutedThisDay(true);
        }
    }, [seats, gamePhase, addLog, setSeats, setWinResult, setWinReason, setCurrentModal, setExecutedPlayerId, setTodayExecutedId, setCurrentDuskExecution, setHasExecutedThisDay, setVictorySnapshot]);

    const checkGameOver = useCallback((
        updatedSeats: Seat[],
        executedPlayerId: number | null = null,
        _isEndOfDay: boolean = false,
        damselGuessed: boolean = false,
        klutzGuessedEvil: boolean = false
    ) => {
        const mastermind = updatedSeats.find(s => s.role?.id === 'mastermind' && !s.isDead && !computeIsPoisoned(s, updatedSeats));
        const isMastermindActive = !!mastermind;

        logicDispatch({
            type: 'CHECK_GAME_OVER',
            executedId: executedPlayerId || undefined,
            lastAction: executedPlayerId ? 'execution' : 'check_phase',
            context: {
                damselGuessed,
                klutzGuessedEvil,
                isVortoxWorld,
                isMastermindActive,
            }
        });
    }, [logicDispatch, isVortoxWorld]);

    const declareMayorImmediateWin = useCallback(() => {
        addLog("市长发动能力：宣布善良阵营获胜！");
        setWinResult('good');
        setWinReason('市长能力发动');
        setGamePhase('gameOver');
        setVictorySnapshot(seats.filter(s => s.role));
        setCurrentModal({ type: 'GAME_OVER', data: null });
    }, [addLog, setWinResult, setWinReason, setGamePhase, setVictorySnapshot, seats, setCurrentModal]);

    return {
        victoryRef,
        logicDispatch,
        checkGameOver,
        declareMayorImmediateWin
    };
}
