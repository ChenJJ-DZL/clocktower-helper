/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useMemo } from "react";
import type { Seat, Role, GamePhase } from "../../app/data";
import type { NightInfoResult, GameRecord } from "../types/game";
import type { ModalType } from "../types/modal";
import { executePoisonAction } from "./roleActionHandlers";
import { type NightActionHandlerContext } from "./useNightActionHandler";
import { useExecutionHandler } from "./useExecutionHandler";
import { hasTeaLadyProtection } from "../utils/gameRules";

/**
 * 处决/击杀/投票处理函数的依赖接口
 */
export interface ExecutionHandlersDeps {
    // State
    seats: Seat[];
    roles: Role[];
    nightInfo: NightInfoResult | null;
    currentModal: ModalType;
    gamePhase: GamePhase;
    nightCount: number;
    nominationMap: Record<number, number>;
    initialSeats: Seat[];
    voteRecords: { voterId: number; isDemon: boolean }[];
    isVortoxWorld: boolean;
    todayExecutedId: number | null;
    mastermindFinalDay: { active: boolean } | null;
    winResult: 'good' | 'evil' | null;
    winReason: string | null;

    // Setters
    setCurrentModal: React.Dispatch<React.SetStateAction<ModalType>>;
    setSeats: React.Dispatch<React.SetStateAction<Seat[]>>;
    setSelectedActionTargets: React.Dispatch<React.SetStateAction<number[]>>;
    setOutsiderDiedToday: (val: boolean) => void;
    setWakeQueueIds: React.Dispatch<React.SetStateAction<number[]>>;
    setDeadThisNight: React.Dispatch<React.SetStateAction<number[]>>;
    setTodayDemonVoted: React.Dispatch<React.SetStateAction<boolean>>;
    setVotedThisRound: React.Dispatch<React.SetStateAction<number[]>>;
    setNominationRecords: React.Dispatch<React.SetStateAction<{ nominators: Set<number>; nominees: Set<number> }>>;
    setNominationMap: React.Dispatch<React.SetStateAction<Record<number, number>>>;
    setWinReason: React.Dispatch<React.SetStateAction<string | null>>;
    setWinResult: React.Dispatch<React.SetStateAction<'good' | 'evil' | null>>;
    setGamePhase: React.Dispatch<React.SetStateAction<GamePhase>>;
    setMastermindFinalDay: React.Dispatch<React.SetStateAction<{ active: boolean } | null>>;
    setVoteInputValue: (val: string) => void;
    setShowVoteErrorToast: (val: boolean) => void;

    // Functions
    addLog: (msg: string) => void;
    addLogWithDeduplication: (msg: string, playerId?: number, roleName?: string) => void;
    killPlayer: (targetId: number, options?: any) => void;
    continueToNextAction: () => void;
    checkGameOver: (seats: Seat[], executedPlayerId?: number | null, isEndOfDay?: boolean, damselGuessed?: boolean, klutzGuessedEvil?: boolean) => void;
    isActorDisabledByPoisonOrDrunk: (...args: any[]) => boolean;
    getRegistrationCached: (targetPlayer: Seat, viewingRole?: Role | null) => any;
    saveHistory: () => void;
    dispatch: (action: any) => void;
    getRandom: <T>(arr: T[]) => T;
    getAliveNeighbors: (seats: Seat[], seatId: number) => Seat[];
    isGoodAlignment: (seat: Seat) => boolean;
    addPoisonMark: (...args: any[]) => any;
    computeIsPoisoned: (...args: any[]) => boolean;
    handleNightAction: (ctx: NightActionHandlerContext) => boolean;
    executePoisonActionFn: typeof executePoisonAction;
    enqueueRavenkeeperIfNeeded: (targetId: number) => void;
    markAbilityUsed: (roleId: string, seatId: number) => void;
    hasUsedAbility: (roleId: string, seatId: number) => boolean;
    reviveSeat: (seat: Seat) => Seat;
    insertIntoWakeQueueAfterCurrent: (seatId: number, options?: any) => void;

    // Sub-hook results
    nightLogic: { processDemonKill: (targetId: number, options?: any) => 'pending' | 'resolved'; startNight: (isFirstNight: boolean) => void };

    // Refs
    processingRef: React.MutableRefObject<boolean>;
    moonchildChainPendingRef: React.MutableRefObject<boolean>;
}

/**
 * useExecutionHandlers - 处理处决、击杀、投票相关逻辑的 Hook
 * 从 useGameController 中提取
 */
export function useExecutionHandlers(deps: ExecutionHandlersDeps) {
    const {
        seats, roles, nightInfo, currentModal, gamePhase, nightCount,
        nominationMap, initialSeats, voteRecords, isVortoxWorld,
        todayExecutedId, mastermindFinalDay,
        setCurrentModal, setSeats, setSelectedActionTargets,
        setOutsiderDiedToday, setWakeQueueIds, setDeadThisNight,
        setTodayDemonVoted, setVotedThisRound,
        setNominationRecords, setNominationMap,
        setWinReason, setMastermindFinalDay,
        setVoteInputValue, setShowVoteErrorToast,
        addLog, addLogWithDeduplication, killPlayer, continueToNextAction,
        checkGameOver, isActorDisabledByPoisonOrDrunk, getRegistrationCached,
        saveHistory, dispatch, getRandom,
        getAliveNeighbors, isGoodAlignment,
        addPoisonMark, computeIsPoisoned,
        handleNightAction, executePoisonActionFn,
        enqueueRavenkeeperIfNeeded,
        nightLogic, processingRef, moonchildChainPendingRef,
        setWinResult, setGamePhase,
        markAbilityUsed, hasUsedAbility, reviveSeat, insertIntoWakeQueueAfterCurrent,
    } = deps;

    const { handleExecution } = useExecutionHandler();

    // Execute player (execution logic)
    const executePlayer = useCallback((id: number, options?: { skipLunaticRps?: boolean; forceExecution?: boolean }) => {
        const seatsSnapshot = seats;
        const t = seatsSnapshot.find(s => s.id === id);
        if (!t || !t.role) return;

        // --- Modular onExecution Support ---
        const execResult = handleExecution({
            executedSeat: t,
            seats,
            gamePhase,
            nightCount,
            nominationMap,
            forceExecution: options?.forceExecution,
            skipLunaticRps: options?.skipLunaticRps,
            setSeats,
            setWinResult,
            setWinReason,
            setGamePhase,
            addLog,
            checkGameOver,
            setCurrentModal,
        });

        // If modular logic handled it or returned shouldWait, stop here
        if (execResult && (execResult.handled || execResult.shouldWait)) {
            return true;
        }

        // --- Legacy/Standard Execution Logic ---
        // Mid execution force override (If a player is executed due to madness, skip ability confirmations)
        if (t.isMad && options?.forceExecution) {
            // Log it
            addLog(`⚖️ ${t.id + 1}号因为处于疯狂状态，说书人决定强制执行处决！`);
            dispatch({ type: 'EXECUTE_PLAYER', targetId: id });
            return true;
        }

        // Saint: Confirm if not forced
        if (t.role.id === 'saint' && !options?.forceExecution) {
            setCurrentModal({ type: 'SAINT_EXECUTION_CONFIRM', data: { targetId: id, skipLunaticRps: options?.skipLunaticRps } });
            return true;
        }
        // Psychopath: RPS if not skipped
        if (t.role.id === 'psychopath' && !options?.skipLunaticRps) {
            const nominatorId = nominationMap[id] ?? null;
            setCurrentModal({ type: 'LUNATIC_RPS', data: { targetId: id, nominatorId } });
            return true;
        }

        // Atomic Dispatch
        dispatch({ type: 'EXECUTE_PLAYER', targetId: id });

        // Godfather: If outsider executed, trigger night ability
        if (t.role.type === 'outsider') {
            setOutsiderDiedToday(true);
            addLog('📜 规则提示：今日有外来者被处决，若场上有教父且未醉/毒，当晚将被唤醒执行额外杀人');
        }

        return !!execResult?.modal;
    }, [dispatch, seats, nominationMap, setCurrentModal, setOutsiderDiedToday, addLog, handleExecution, setSeats, setWinResult, setWinReason, setGamePhase, checkGameOver]);

    // Confirm kill handler
    const confirmKill = useCallback(() => {
        if (!nightInfo || currentModal?.type !== 'KILL_CONFIRM') return;

        if (processingRef.current) return;
        processingRef.current = true;

        const targetId = currentModal.data.targetId;
        const impSeat = nightInfo.seat;

        const actorSeat = seats.find(s => s.id === nightInfo?.seat?.id);
        if (isActorDisabledByPoisonOrDrunk(actorSeat, nightInfo.isPoisoned)) {
            addLogWithDeduplication(
                `${nightInfo?.seat?.id ? nightInfo.seat.id + 1 : 0}号(${nightInfo?.effectiveRole?.name ?? ''}) 处于中毒/醉酒状态，本夜对${targetId + 1}号的攻击无效，无事发生`,
                nightInfo.seat.id,
                nightInfo.effectiveRole.name
            );
            setCurrentModal(null);
            setSelectedActionTargets([]);
            continueToNextAction();
            return;
        }

        // 小恶魔自杀逻辑 (Star Pass)
        if (targetId === impSeat.id && nightInfo.effectiveRole.id === 'imp') {
            const aliveMinions = seats.filter(s => s.role?.type === 'minion' && !s.isDead && s.id !== impSeat.id);

            if (aliveMinions.length > 0) {
                const newImp = getRandom(aliveMinions);
                dispatch({ type: 'IMP_STAR_PASS', oldImpId: impSeat.id, newImpId: newImp.id });

                setWakeQueueIds(prev => prev.filter(id => id !== impSeat.id));
                setDeadThisNight(prev => [...prev, impSeat.id]);
                enqueueRavenkeeperIfNeeded(impSeat.id);

                console.warn(`%c 小恶魔传位成功 -> ${newImp.id + 1}号`, 'color: #FFD700; font-weight: bold;');

                setCurrentModal(null);
                return;
            } else {
                addLogWithDeduplication(`${impSeat.id + 1}号(小恶魔) 自杀但无爪牙传位，直接死亡`, impSeat.id, '小恶魔');
                dispatch({ type: 'KILL_PLAYER', targetId: impSeat.id, source: 'demon' });
                setCurrentModal(null);
                return;
            }
        } else {
            const result = nightLogic.processDemonKill(targetId);
            if (result === 'pending') return;
        }
        setCurrentModal(null);
        if (moonchildChainPendingRef.current) {
            processingRef.current = false;
            return;
        }

        setTimeout(() => {
            continueToNextAction();
            processingRef.current = false;
        }, 50);
    }, [nightInfo, currentModal?.type, seats, isActorDisabledByPoisonOrDrunk, addLogWithDeduplication, setCurrentModal, setSelectedActionTargets, continueToNextAction, getRandom, roles, setSeats, setWakeQueueIds, checkGameOver, setDeadThisNight, enqueueRavenkeeperIfNeeded, killPlayer, nightLogic, moonchildChainPendingRef]);

    // Submit votes handler
    const submitVotes = useCallback((v: number, voters?: number[]) => {
        if (currentModal?.type !== 'VOTE_INPUT') return;
        const voterId = currentModal.data.voterId;

        const initialPlayerCount = initialSeats.length > 0
            ? initialSeats.filter(s => s.role !== null).length
            : seats.filter(s => s.role !== null).length;

        if (isNaN(v) || v < 1 || !Number.isInteger(v)) {
            alert(`票数必须是自然数大于等于1的整数`);
            return;
        }

        if (v > initialPlayerCount) {
            alert(`票数不能超过开局时的玩家数${initialPlayerCount}人`);
            return;
        }

        if (voters && voters.length > 0) {
            const invalidDead = voters.some(id => {
                const seat = seats.find(s => s.id === id);
                return seat && seat.isDead && seat.hasGhostVote === false;
            });
            if (invalidDead) {
                alert('存在已用完幽灵票的死亡玩家，无法计票');
                return;
            }
        }

        saveHistory();

        const voteRecord = voteRecords.find(r => r.voterId === voterId);
        const isDemonVote = voteRecord?.isDemon || false;
        if (isDemonVote) {
            setTodayDemonVoted(true);
        }

        const aliveCoreSeats = seats.filter(s => !s.isDead && s.role && s.role.type !== 'traveler');
        const aliveCount = aliveCoreSeats.length;
        const threshold = Math.ceil(aliveCount / 2);

        setSeats(prev => prev.map(s => {
            let next = s;
            if (voters && voters.includes(s.id) && s.isDead && s.hasGhostVote) {
                next = { ...next, hasGhostVote: false };
            }
            if (s.id === voterId) {
                next = { ...next, voteCount: v, isCandidate: v >= threshold };
            }
            return next;
        }));

        if (voters) {
            setVotedThisRound(voters);
        }

        const voterSeat = seats.find(s => s.id === voterId);
        const voterListText = voters && voters.length ? ` | 投票者: ${voters.map(id => `${id + 1}号`).join('、')}` : '';
        addLog(`${voterId + 1}号获得 ${v} 票${v >= threshold ? ' (上台)' : ''}${isDemonVote ? '，恶魔投票' : ''}${voterSeat?.isDead ? '（死亡玩家投票）' : ''}${voterListText}`);
        setVoteInputValue('');
        setShowVoteErrorToast(false);
        setCurrentModal(null);
    }, [currentModal, initialSeats, seats, voteRecords, saveHistory, setTodayDemonVoted, setSeats, addLog, setVoteInputValue, setShowVoteErrorToast, setCurrentModal, setVotedThisRound]);

    // Execute judgment handler
    const executeJudgment = useCallback(() => {
        saveHistory();

        const cands = seats.filter(s => s.isCandidate).sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
        if (cands.length === 0) {
            setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: "无人上台无人被处决" } });
            return;
        }

        const aliveCoreSeats = seats.filter(s => !s.isDead && s.role && s.role.type !== 'traveler');
        const aliveCount = aliveCoreSeats.length;
        const threshold = Math.ceil(aliveCount / 2);

        const max = cands[0].voteCount || 0;

        const qualifiedCands = cands.filter(c => (c.voteCount || 0) >= threshold);
        if (qualifiedCands.length === 0) {
            setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `最高票 ${max} 未达到半数 ${threshold}，无人被处决` } });
            return;
        }

        const maxVoteCount = qualifiedCands[0].voteCount || 0;
        const tops = qualifiedCands.filter(c => c.voteCount === maxVoteCount);

        if (tops.length > 1) {
            setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `平票（${tops.length}人并列最高票 ${maxVoteCount}），平安日无人被处决` } });
        } else if (tops.length === 1) {
            const executed = tops[0];

            // 1. 茶艺师保护逻辑
            if (hasTeaLadyProtection(executed, seats)) {
                const msg = `由于茶艺师保护，${executed.id + 1}号免于处决`;
                addLog(msg);
                setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: msg } });
                return;
            }

            // 2. 和平主义者逻辑
            const activePacifist = seats.find(s =>
                s.role?.id === 'pacifist' &&
                !s.isDead &&
                !isActorDisabledByPoisonOrDrunk(s)
            );
            if (activePacifist && isGoodAlignment(executed)) {
                setCurrentModal({
                    type: 'PACIFIST_CONFIRM',
                    data: {
                        targetId: executed.id,
                        onResolve: (saved: boolean) => {
                            if (saved) {
                                const msg = `由于和平主义者能力，${executed.id + 1}号免于死亡`;
                                addLog(msg);
                                setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: msg } });
                            } else {
                                const modalShown = executePlayer(executed.id);
                                if (!modalShown) {
                                    setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `${executed.id + 1}号被处决` } });
                                }
                            }
                        }
                    }
                });
                return;
            }

            const modalShown = executePlayer(executed.id);
            if (!modalShown) {
                setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `${executed.id + 1}号被处决` } });
            }
        }
    }, [saveHistory, seats, setCurrentModal, getAliveNeighbors, isGoodAlignment, executePlayer, addLog]);

    // Confirm poison handler
    const confirmPoison = useCallback(() => {
        if (!nightInfo || currentModal?.type !== 'POISON_CONFIRM') return;

        if (processingRef.current) return;
        processingRef.current = true;

        const targetId = currentModal.data.targetId;
        setCurrentModal(null);

        const nightActionHandlerContext: NightActionHandlerContext = {
            nightInfo,
            seats,
            selectedTargets: [targetId],
            gamePhase,
            nightCount,
            roles,
            setSeats,
            setSelectedActionTargets,
            addLog: addLogWithDeduplication,
            continueToNextAction,
            setCurrentModal,
            isConfirmed: true,
            markAbilityUsed,
            hasUsedAbility,
            reviveSeat,
            insertIntoWakeQueueAfterCurrent,
        };

        if (!handleNightAction(nightActionHandlerContext)) {
            const delayedContinue = () => {
                setTimeout(() => {
                    continueToNextAction();
                    processingRef.current = false;
                }, 50);
            };
            executePoisonActionFn(targetId, false, {
                nightInfo,
                seats,
                setSeats,
                setCurrentModal: () => { },
                setSelectedActionTargets: () => { },
                continueToNextAction: delayedContinue,
                isActorDisabledByPoisonOrDrunk,
                addLogWithDeduplication,
                addPoisonMark,
                computeIsPoisoned,
            });
        } else {
            setTimeout(() => {
                processingRef.current = false;
            }, 50);
        }
    }, [currentModal, nightInfo, seats, setSeats, setCurrentModal, setSelectedActionTargets, continueToNextAction, isActorDisabledByPoisonOrDrunk, addLogWithDeduplication, addPoisonMark, computeIsPoisoned, executePoisonActionFn, gamePhase, nightCount, roles, handleNightAction]);

    // Confirm poison evil handler
    const confirmPoisonEvil = useCallback(() => {
        if (!nightInfo || currentModal?.type !== 'POISON_EVIL_CONFIRM') return;

        if (processingRef.current) return;
        processingRef.current = true;

        const targetId = currentModal.data.targetId;
        setCurrentModal(null);

        const nightActionHandlerContext: NightActionHandlerContext = {
            nightInfo,
            seats,
            selectedTargets: [targetId],
            gamePhase,
            nightCount,
            roles,
            setSeats,
            setSelectedActionTargets,
            addLog: addLogWithDeduplication,
            continueToNextAction,
            setCurrentModal,
            isConfirmed: true,
            markAbilityUsed,
            hasUsedAbility,
            reviveSeat,
            insertIntoWakeQueueAfterCurrent,
        };

        if (!handleNightAction(nightActionHandlerContext)) {
            const delayedContinue = () => {
                setTimeout(() => {
                    continueToNextAction();
                    processingRef.current = false;
                }, 50);
            };
            executePoisonActionFn(targetId, true, {
                nightInfo,
                seats,
                setSeats,
                setCurrentModal: () => { },
                setSelectedActionTargets: () => { },
                continueToNextAction: delayedContinue,
                isActorDisabledByPoisonOrDrunk,
                addLogWithDeduplication,
                addPoisonMark,
                computeIsPoisoned,
            });
        } else {
            setTimeout(() => {
                processingRef.current = false;
            }, 50);
        }
    }, [currentModal, nightInfo, seats, setSeats, setCurrentModal, setSelectedActionTargets, continueToNextAction, isActorDisabledByPoisonOrDrunk, addLogWithDeduplication, addPoisonMark, computeIsPoisoned, executePoisonActionFn, gamePhase, nightCount, roles, handleNightAction]);

    const startSubsequentNight = useCallback(() => {
        nightLogic.startNight(false);
    }, [nightLogic]);

    // Confirm execution result handler
    const confirmExecutionResult = useCallback(() => {
        if (currentModal?.type !== 'EXECUTION_RESULT') return;
        const isVirginTrigger = currentModal.data.isVirginTrigger;
        setCurrentModal(null);

        if (isVirginTrigger) {
            startSubsequentNight();
            return;
        }

        // BMR：主谋额外一天的结算
        if (mastermindFinalDay?.active) {
            dispatch({
                type: 'CHECK_GAME_OVER',
                executedId: todayExecutedId ?? undefined,
                lastAction: todayExecutedId ? 'execution' : 'check_phase',
                context: {
                    isMastermindActive: true,
                }
            });
            setMastermindFinalDay(null);
            return;
        }

        const cands = seats.filter(s => s.isCandidate).sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
        if (cands.length === 0) {
            startSubsequentNight();
            return;
        }

        const aliveCoreSeats = seats.filter(s => !s.isDead && s.role && s.role.type !== 'traveler');
        const aliveCount = aliveCoreSeats.length;
        const threshold = Math.ceil(aliveCount / 2);

        const max = cands[0].voteCount || 0;
        const qualifiedCands = cands.filter(c => (c.voteCount || 0) >= threshold);
        const maxVoteCount = qualifiedCands.length > 0 ? qualifiedCands[0].voteCount || 0 : 0;
        const tops = qualifiedCands.filter(c => c.voteCount === maxVoteCount);
        if (tops.length !== 1) {
            if (isVortoxWorld && todayExecutedId === null) {
                dispatch({
                    type: 'CHECK_GAME_OVER',
                    executedId: undefined,
                    lastAction: 'execution',
                    context: { isVortoxWorld }
                });
                return;
            }
            startSubsequentNight();
        }
    }, [currentModal, setCurrentModal, seats, isVortoxWorld, todayExecutedId, dispatch, mastermindFinalDay, setMastermindFinalDay, startSubsequentNight]);

    // Resolve lunatic RPS handler
    const resolveLunaticRps = useCallback((result: 'win' | 'lose' | 'tie') => {
        if (currentModal?.type !== 'LUNATIC_RPS') return;
        const { targetId, nominatorId } = currentModal.data;
        const nominatorNote = nominatorId !== null ? `提名者${nominatorId + 1}号` : '';
        if (result === 'lose') {
            addLog(`${targetId + 1}号(精神病患者) 在石头剪刀布中落败${nominatorNote}，被处决`);
            executePlayer(targetId, { skipLunaticRps: true });
            setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `${targetId + 1}号被处决，石头剪刀布落败` } });
        } else {
            if (nominatorId !== null) {
                addLog(`${targetId + 1}号(精神病患者) 在石头剪刀布中获胜或打平，${nominatorNote}提名者被处决`);
                killPlayer(nominatorId);
                setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `${nominatorId + 1}号被处决，因精神病患者猜拳获胜` } });
            } else {
                addLog(`${targetId + 1}号(精神病患者) 在石头剪刀布中获胜或打平${nominatorNote}，处决取消`);
                setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `${targetId + 1}号存活，处决取消` } });
            }
            setSeats((p: Seat[]) => p.map(s => ({ ...s, isCandidate: false, voteCount: undefined })));
            setNominationRecords({ nominators: new Set(), nominees: new Set() });
            setNominationMap({});
        }
        setCurrentModal(null);
    }, [currentModal, executePlayer, addLog, seats, setSeats, checkGameOver, setCurrentModal, setNominationRecords, setNominationMap]);

    // Confirm shoot result handler
    const confirmShootResult = useCallback(() => {
        setCurrentModal(null);
    }, [setCurrentModal]);

    // Handle slayer target selection
    const handleSlayerTargetSelect = useCallback((targetId: number) => {
        if (currentModal?.type !== 'SLAYER_SELECT_TARGET') return;
        const { shooterId } = currentModal.data;

        const shooter = seats.find(s => s.id === shooterId);
        if (!shooter) return;

        saveHistory();
        setSeats((p: Seat[]) => p.map(s => s.id === shooterId ? { ...s, hasUsedSlayerAbility: true } : s));

        const target = seats.find(s => s.id === targetId);
        if (!target) {
            alert('目标不存在');
            setCurrentModal(null);
            return;
        }

        if (target.isDead) {
            addLog(`${shooterId + 1}号对${targetId + 1}号的尸体开枪未产生效果`);
            setCurrentModal({ type: 'SHOOT_RESULT', data: { message: "无事发生目标已死亡", isDemonDead: false } });
            return;
        }

        const isRealSlayer = shooter.role?.id === 'slayer' && !isActorDisabledByPoisonOrDrunk(shooter) && !shooter.isDead;
        const targetRegistration = getRegistrationCached(target, shooter.role);
        const isDemon = targetRegistration.registersAsDemon;

        if (isRealSlayer && isDemon) {
            addLog(`${shooterId + 1}号(猎手) 开枪击杀 ${targetId + 1}号(恶魔)`);
            addLog(`猎手的子弹击中了恶魔，按照规则游戏立即结束，不再进行今天的处决和后续夜晚`);
            setWinReason('猎手击杀恶魔');
            killPlayer(targetId, { skipGameOverCheck: false, isEndOfDay: true });
            setCurrentModal({ type: 'SHOOT_RESULT', data: { message: "恶魔死亡，善良阵营获胜", isDemonDead: true } });
        } else {
            const isPoisonedOrDrunk = isActorDisabledByPoisonOrDrunk(shooter);
            if (isPoisonedOrDrunk) {
                addLog(`${shooterId + 1}号(猎手) 开枪，但由于${shooter.isPoisoned ? '中毒' : '醉酒'}状态，能力失效`);
            } else {
                addLog(`${shooterId + 1}号${shooter.role?.id === 'slayer' ? '(猎手)' : ''} 开枪，${targetId + 1}号不是恶魔`);
            }
            setCurrentModal({ type: 'SHOOT_RESULT', data: { message: "无事发生", isDemonDead: false } });
        }
    }, [currentModal, seats, saveHistory, getRegistrationCached, checkGameOver, addLog, setCurrentModal, setSeats, setWinReason]);

    return useMemo(() => ({
        executePlayer,
        confirmKill,
        submitVotes,
        executeJudgment,
        confirmPoison,
        confirmPoisonEvil,
        startSubsequentNight,
        confirmExecutionResult,
        resolveLunaticRps,
        confirmShootResult,
        handleSlayerTargetSelect,
    }), [
        executePlayer, confirmKill, submitVotes, executeJudgment, confirmPoison,
        confirmPoisonEvil, startSubsequentNight, confirmExecutionResult,
        resolveLunaticRps, confirmShootResult, handleSlayerTargetSelect
    ]);
}
