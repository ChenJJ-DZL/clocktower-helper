/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useMemo } from "react";
import type { Seat, Role, GamePhase } from "../../app/data";
import type { ModalType } from "../types/modal";
import { getRoleDefinition } from "../roles";
import { DayActionContext } from "../types/roleDefinition";
import { isAntagonismEnabled, checkCannotGainAbility } from "../utils/antagonism";

/**
 * DayAbilityConfig 类型重新声明（与 useGameController 中一致）
 */
export interface DayAbilityConfig {
    roleId: string;
    title: string;
    description: string;
    usage: 'daily' | 'once';
    actionType?: 'lunaticKill';
    logMessage: (seat: Seat) => string;
}

/**
 * 白天行动函数的依赖接口
 */
export interface DayActionsDeps {
    // State
    seats: Seat[];
    roles: Role[];
    currentModal: ModalType;
    gamePhase: GamePhase;
    nominationMap: Record<number, number>;
    nominationRecords: { nominators: Set<number>; nominees: Set<number> };
    witchActive: boolean;
    witchCursedId: number | null;
    virginGuideInfo: { targetId: number; nominatorId: number; isFirstTime: boolean; nominatorIsTownsfolk: boolean } | null;
    dayAbilityForm: Record<string, any>;

    // Setters
    setCurrentModal: React.Dispatch<React.SetStateAction<ModalType>>;
    setSeats: React.Dispatch<React.SetStateAction<Seat[]>>;
    setNominationMap: React.Dispatch<React.SetStateAction<Record<number, number>>>;
    setNominationRecords: React.Dispatch<React.SetStateAction<{ nominators: Set<number>; nominees: Set<number> }>>;
    setTodayMinionNominated: React.Dispatch<React.SetStateAction<boolean>>;
    setVirginGuideInfo: React.Dispatch<React.SetStateAction<any>>;
    setWitchCursedId: React.Dispatch<React.SetStateAction<number | null>>;
    setWitchActive: React.Dispatch<React.SetStateAction<boolean>>;
    setVoteInputValue: (val: string) => void;
    setShowVoteErrorToast: (val: boolean) => void;
    setExecutedPlayerId: React.Dispatch<React.SetStateAction<number | null>>;
    setTodayExecutedId: React.Dispatch<React.SetStateAction<number | null>>;
    setHasExecutedThisDay: React.Dispatch<React.SetStateAction<boolean>> | undefined;
    setCurrentDuskExecution: React.Dispatch<React.SetStateAction<number | null>>;
    setVfxTrigger: React.Dispatch<React.SetStateAction<any>>;
    setWinResult: React.Dispatch<React.SetStateAction<any>>;
    setWinReason: React.Dispatch<React.SetStateAction<string | null>>;
    setGamePhase: React.Dispatch<React.SetStateAction<GamePhase>>;
    setDayAbilityForm: React.Dispatch<React.SetStateAction<Record<string, any>>>;
    setVotedThisRound: React.Dispatch<React.SetStateAction<number[]>>;

    // Functions
    addLog: (msg: string) => void;
    killPlayer: (targetId: number, options?: any) => void;
    checkGameOver: (seats: Seat[], executedPlayerId?: number | null, isEndOfDay?: boolean, damselGuessed?: boolean, klutzGuessedEvil?: boolean) => void;
    isActorDisabledByPoisonOrDrunk: (seat: Seat) => boolean;
    getRegistrationCached: (targetPlayer: Seat, viewingRole?: Role | null) => any;
    saveHistory: () => void;
    hasUsedAbility: (roleId: string, seatId: number) => boolean;
    hasUsedDailyAbility: (roleId: string, seatId: number) => boolean;
    markAbilityUsed: (roleId: string, seatId: number) => void;
    markDailyAbilityUsed: (roleId: string, seatId: number) => void;
    continueToNextAction: () => void;
    proceedToFirstNight: (rolesToUse?: Role[]) => void;
    changeRole: (seatId: number, roleId: string, roles: Role[]) => void;
    dispatch: (action: any) => void;
}

/**
 * useDayActions - 处理白天行动的 Hook
 * 从 useGameController 中提取的 Group B 函数
 */
export function useDayActions(deps: DayActionsDeps) {
    const {
        seats, roles, currentModal, gamePhase,
        nominationMap, nominationRecords,
        witchActive, witchCursedId, virginGuideInfo,
        setCurrentModal, setSeats,
        setNominationMap, setNominationRecords, setTodayMinionNominated,
        setVirginGuideInfo, setWitchCursedId, setWitchActive,
        setVoteInputValue, setShowVoteErrorToast,
        setExecutedPlayerId, setTodayExecutedId, setHasExecutedThisDay, setCurrentDuskExecution,
        setVfxTrigger, setWinResult, setWinReason, setGamePhase, setDayAbilityForm, setVotedThisRound,
        addLog, killPlayer, checkGameOver, isActorDisabledByPoisonOrDrunk,
        getRegistrationCached, saveHistory, hasUsedAbility, hasUsedDailyAbility,
        markAbilityUsed, markDailyAbilityUsed, continueToNextAction, proceedToFirstNight,
        changeRole, dispatch,
    } = deps;

    const executeNomination = useCallback((sourceId: number, id: number, options?: { virginGuideOverride?: { isFirstTime: boolean; nominatorIsTownsfolk: boolean }; openVoteModal?: boolean }) => {
        const nominatorSeat = seats.find(s => s.id === sourceId);
        if (!nominatorSeat || nominatorSeat.isDead) {
            addLog(`只有存活的玩家可以发起提名`);
            return;
        }

        const currentNomineeCount = Object.keys(nominationMap).length;
        if (currentNomineeCount > 0 && !nominationMap[id]) {
            addLog(`规则：同一时间只能有一名玩家被提名。请先完成当前提名的投票`);
            return;
        }

        if (nominationRecords.nominators.has(sourceId)) {
            addLog(`每名玩家每个黄昏只能发起一次提名`);
            return;
        }

        if (sourceId !== id && nominationRecords.nominees.has(id)) {
            addLog(`每名玩家每个黄昏只能被提名一次`);
            return;
        }

        if (sourceId === id && nominationRecords.nominees.has(id)) {
            addLog(`每名玩家每个黄昏只能被提名一次`);
            return;
        }

        if (witchActive && witchCursedId !== null) {
            const aliveCount = seats.filter(s => !s.isDead).length;
            if (aliveCount > 3 && witchCursedId === sourceId) {
                addLog(`${sourceId + 1}发起提名触发女巫诅咒立刻死亡`);
                killPlayer(sourceId, { skipGameOverCheck: false, recordNightDeath: false });
                setWitchCursedId(null);
                setWitchActive(false);
                return;
            }
        }
        setNominationMap((prev: Record<number, number>) => ({ ...prev, [id]: sourceId }));
        if (nominatorSeat?.role?.type === 'minion') {
            setTodayMinionNominated(true);
        }

        const target = seats.find(s => s.id === id);
        const virginOverride = options?.virginGuideOverride;

        if (target?.role?.id === 'virgin' && !isActorDisabledByPoisonOrDrunk(target)) {
            const isFirstNomination = virginOverride?.isFirstTime ?? !target.hasBeenNominated;
            const currentSeats = seats;

            if (!virginOverride && isFirstNomination) {
                setVirginGuideInfo({
                    targetId: id,
                    nominatorId: sourceId,
                    isFirstTime: true,
                    nominatorIsTownsfolk: false,
                });
                return;
            }

            if (!isFirstNomination) {
                const updatedSeats = currentSeats.map(s =>
                    s.id === id ? { ...s, hasBeenNominated: true, hasUsedVirginAbility: true } : s
                );
                setSeats(updatedSeats);
                addLog(`提示：${id + 1}号贞洁者已在本局被提名过一次，她的能力已经失效，本次提名不会再立即处决提名者`);
            } else {
                const updatedSeats = currentSeats.map(s =>
                    s.id === id ? { ...s, hasBeenNominated: true, hasUsedVirginAbility: true } : s
                );

                const isRealTownsfolk = virginOverride?.nominatorIsTownsfolk ?? (
                    nominatorSeat &&
                    nominatorSeat.role?.type === 'townsfolk' &&
                    nominatorSeat.role?.id !== 'drunk' &&
                    !nominatorSeat.isDrunk
                );

                if (isRealTownsfolk) {
                    const finalSeats = updatedSeats.map((s) =>
                        s.id === sourceId ? { ...s, isDead: true } : s
                    );

                    setSeats(finalSeats);
                    setExecutedPlayerId(sourceId);
                    setTodayExecutedId(sourceId);
                    setHasExecutedThisDay?.(true);
                    setCurrentDuskExecution(sourceId);

                    setNominationMap({});
                    setNominationRecords((prev: { nominators: Set<number>; nominees: Set<number> }) => ({
                        nominators: new Set(prev.nominators).add(sourceId),
                        nominees: new Set(prev.nominees).add(id),
                    }));

                    addLog(`${sourceId + 1}号提名 ${id + 1}号（贞洁者）`);
                    addLog(`因为你提名了贞洁者，${sourceId + 1}号被立即处决`);

                    dispatch({ type: 'EXECUTE_PLAYER', targetId: sourceId });

                    setCurrentModal({
                        type: "EXECUTION_RESULT",
                        data: { message: `${sourceId + 1}号玩家被处决`, isVirginTrigger: true },
                    });
                    return;
                } else {
                    setSeats(updatedSeats);
                }
            }
        }

        if (nominatorSeat?.role?.id === 'golem') {
            const targetSeat = seats.find(s => s.id === id);
            const isDemon = targetSeat && (targetSeat.role?.type === 'demon' || targetSeat.isDemonSuccessor);
            if (!isDemon) {
                addLog(`${sourceId + 1}号(魔像) 提名 ${id + 1}号，${id + 1}号不是恶魔，${id + 1}号死亡`);
                dispatch({ type: 'KILL_PLAYER', targetId: id, source: 'golem' });
            }
            setSeats(p => p.map(s => s.id === sourceId ? { ...s, hasUsedSlayerAbility: true } : s));
        }

        setNominationRecords((prev: { nominators: Set<number>; nominees: Set<number> }) => ({
            nominators: new Set(prev.nominators).add(sourceId),
            nominees: new Set(prev.nominees).add(id)
        }));
        addLog(`${sourceId + 1}号提名 ${id + 1}号`);
        setVoteInputValue('');
        setShowVoteErrorToast(false);
        if (options?.openVoteModal !== false) {
            setCurrentModal({ type: 'VOTE_INPUT', data: { voterId: id } });
        }
    }, [nominationRecords, seats, witchActive, witchCursedId, killPlayer, checkGameOver, getRegistrationCached, addLog, setNominationMap, setTodayMinionNominated, setVirginGuideInfo, setSeats, setWinResult, setWinReason, setGamePhase, setCurrentModal, setNominationRecords, setVoteInputValue, setShowVoteErrorToast, setWitchCursedId, setWitchActive, isActorDisabledByPoisonOrDrunk, setExecutedPlayerId, setTodayExecutedId, setHasExecutedThisDay, setCurrentDuskExecution, dispatch]);

    const handleVirginGuideConfirm = useCallback(() => {
        if (!virginGuideInfo) return;
        executeNomination(virginGuideInfo.nominatorId, virginGuideInfo.targetId, {
            virginGuideOverride: {
                isFirstTime: virginGuideInfo.isFirstTime,
                nominatorIsTownsfolk: virginGuideInfo.nominatorIsTownsfolk
            }
        });
        setVirginGuideInfo(null);
        setCurrentModal(null);
    }, [virginGuideInfo, executeNomination, setVirginGuideInfo, setCurrentModal]);

    const handleDayAction = useCallback((id: number) => {
        if (currentModal?.type !== 'DAY_ACTION') return;
        const { type, sourceId } = currentModal.data;
        setCurrentModal(null);
        if (type === 'nominate') {
            executeNomination(sourceId, id);
        } else if (type === 'slayer') {
            const shooter = seats.find(s => s.id === sourceId);
            if (!shooter) return;
            if (shooter.hasUsedSlayerAbility) {
                alert('该玩家已经使用过猎手能力了！');
                return;
            }
            if (shooter.isDead) {
                addLog(`${sourceId + 1}号已死亡无法开枪`);
                setCurrentModal({ type: 'SHOOT_RESULT', data: { message: "无事发生射手已死亡", isDemonDead: false } });
                return;
            }
            setCurrentModal({ type: 'SLAYER_SELECT_TARGET', data: { shooterId: sourceId } });
            return;
        } else if (type === 'lunaticKill') {
            saveHistory();
            const killer = seats.find(s => s.id === sourceId);
            if (!killer || killer.role?.id !== 'psychopath') return;
            if (hasUsedDailyAbility('psychopath', sourceId)) {
                addLog(`${sourceId + 1}号(精神病患者) 尝试再次使用日杀能力但本局每名精神病患者只能日杀一次当前已用完`);
                setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: "精神病患者每局只能日杀一次当前已用完" } });
                return;
            }
            const target = seats.find(s => s.id === id);
            if (!target) return;
            if (target.isDead) {
                addLog(`${sourceId + 1}号(精神病患者) 试图在白天杀死 ${id + 1}号，但对方已死亡`);
                setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `${id + 1}号已死亡，未产生新的死亡` } });
            } else {
                setVfxTrigger({ seatId: id, type: 'slayer' });
                setTimeout(() => setVfxTrigger(null), 1000);

                const updatedSeats = seats.map(s => s.id === id ? { ...s, isDead: true, isSentenced: false } : s);
                setSeats(updatedSeats);
                addLog(`${sourceId + 1}号(精神病患者) 在提名前公开杀死 ${id + 1}号`);
                checkGameOver(updatedSeats, id);
            }
            markDailyAbilityUsed('psychopath', sourceId);
            addLog(`精神病患者本局的日间击杀能力已经使用完毕，之后不能再发动`);
        }
    }, [currentModal, seats, saveHistory, hasUsedDailyAbility, markDailyAbilityUsed, getRegistrationCached, checkGameOver, executeNomination, addLog, setCurrentModal, setSeats, setWinReason]);

    const handleDrunkCharadeSelect = useCallback((selectedCharadeRoleId: string) => {
        const drunkSeat = seats.find(s => s.role?.id === 'drunk' && !s.charadeRole);
        if (!drunkSeat) {
            addLog('[handleDrunkCharadeSelect] 未找到需要设置伪装身份的酒鬼座位');
            setCurrentModal(null);
            continueToNextAction();
            return;
        }

        const selectedRole = roles.find(r => r.id === selectedCharadeRoleId);
        if (!selectedRole) {
            alert('选择的伪装身份无效，请重试。');
            setCurrentModal(null);
            return;
        }

        setSeats(prevSeats => prevSeats.map(s => {
            if (s.id === drunkSeat.id) {
                addLog(`为 ${s.id + 1}号 酒鬼设置伪装身份：${selectedRole.name}`);
                return { ...s, charadeRole: selectedRole, displayRole: selectedRole, isDrunk: true };
            }
            return s;
        }));
        setCurrentModal(null);

        if (gamePhase === 'setup' || gamePhase === 'check') {
            proceedToFirstNight(roles);
        } else {
            continueToNextAction();
        }
    }, [seats, roles, gamePhase, setSeats, setCurrentModal, addLog, continueToNextAction, proceedToFirstNight]);

    const registerVotes = useCallback((seatIds: number[]) => {
        setVotedThisRound(seatIds);
    }, [setVotedThisRound]);

    const handleDayAbilityTrigger = useCallback((seat: Seat, config: DayAbilityConfig) => {
        if (!seat.role || seat.isDead) return;
        if (config.usage === 'once' && hasUsedAbility(config.roleId, seat.id)) return;
        if (config.usage === 'daily' && hasUsedDailyAbility(config.roleId, seat.id)) return;
        saveHistory();
        if (config.actionType === 'lunaticKill') {
            setCurrentModal({ type: 'DAY_ACTION', data: { type: 'lunaticKill', sourceId: seat.id } });
            return;
        }
        if (['savant_mr', 'amnesiac', 'fisherman', 'engineer'].includes(config.roleId)) {
            setCurrentModal({ type: 'DAY_ABILITY', data: { roleId: config.roleId, seatId: seat.id } });
            setDayAbilityForm({});
            return;
        }
        addLog(config.logMessage(seat));
        if (config.usage === 'once') {
            markAbilityUsed(config.roleId, seat.id);
        } else {
            markDailyAbilityUsed(config.roleId, seat.id);
        }
    }, [hasUsedAbility, hasUsedDailyAbility, saveHistory, markAbilityUsed, markDailyAbilityUsed, addLog, setCurrentModal, setDayAbilityForm]);

    const checkGameOverSimple = useCallback((seatsToCheck: Seat[]): 'good' | 'evil' | null => {
        const livingDemon = seatsToCheck.find(s =>
            (s.role?.type === 'demon' || s.isDemonSuccessor) && !s.isDead
        );
        if (!livingDemon) {
            const aliveCount = seatsToCheck.filter(s => !s.isDead).length;
            const scarletWoman = seatsToCheck.find(s =>
                s.role?.id === 'scarlet_woman' && !s.isDead && !s.isDemonSuccessor
            );
            if (aliveCount < 5 || !scarletWoman) {
                return 'good';
            }
            return null;
        }

        const livingCount = seatsToCheck.filter(s => {
            if (!s || !s.role) return false;
            if (s.role.id === 'zombuul' && s.isFirstDeathForZombuul && !s.isZombuulTrulyDead) {
                return true;
            }
            return !s.isDead;
        }).filter(s => s.role && s.role.type !== 'traveler').length;
        if (livingCount <= 2) return 'evil';

        return null;
    }, []);

    const handleDayAbility = useCallback((sourceSeatId: number, targetSeatId?: number) => {
        const sourceSeat = seats.find(s => s.id === sourceSeatId);
        if (!sourceSeat || !sourceSeat.role) return;

        const modularHandler = getRoleDefinition(sourceSeat.role.id);
        if (modularHandler && modularHandler.day) {
            if (sourceSeat.hasUsedDayAbility && modularHandler.day.maxUses !== 'infinity') {
                alert("此玩家已经使用过技能了！");
                return;
            }

            const dayContext: DayActionContext = {
                seats,
                selfId: sourceSeatId,
                targets: targetSeatId !== undefined ? [targetSeatId] : [],
                gamePhase,
                roles
            };

            const result = modularHandler.day.handler(dayContext);

            if (result.updates.length > 0) {
                setSeats(prev => prev.map(s => {
                    const update = result.updates.find((upd: { id: number; }) => upd.id === s.id);
                    return update ? { ...s, ...update } : s;
                }));
            }

            if (modularHandler.day.maxUses !== 'infinity') {
                setSeats(prev => prev.map(s =>
                    s.id === sourceSeatId ? { ...s, hasUsedDayAbility: true } : s
                ));
            }

            if (result.logs.privateLog) addLog(result.logs.privateLog);
            if (result.logs.publicLog) addLog(result.logs.publicLog);

            if (result.modal) {
                setCurrentModal(result.modal);
            }

            return;
        }

        if (!sourceSeat.role.dayMeta) {
            return;
        }

        if (sourceSeat.hasUsedDayAbility) {
            alert("此玩家已经使用过技能了！");
            return;
        }

        const meta = sourceSeat.role.dayMeta;
        let logMessage = `${sourceSeatId + 1}号 [${sourceSeat.role.name}] 发动技能`;

        saveHistory();

        setSeats(prev => prev.map(s =>
            s.id === sourceSeatId
                ? { ...s, hasUsedDayAbility: true, hasUsedSlayerAbility: s.role?.id === 'slayer' ? true : s.hasUsedSlayerAbility }
                : s
        ));

        if (meta.effectType === 'slayer_check' && targetSeatId !== undefined) {
            const targetSeat = seats.find(s => s.id === targetSeatId);
            logMessage += ` 射击了 ${targetSeatId + 1}号`;

            if (!targetSeat) {
                logMessage += ` -> ❌ 目标不存在`;
                addLog(logMessage);
                alert(`❌ 目标座位不存在`);
                return;
            }

            if (targetSeat.isDead) {
                logMessage += ` -> 💨 未命中 (目标已死亡)`;
                addLog(logMessage);
                alert(`💨 杀手射击失败。\n目标已死亡。`);
                return;
            }

            const targetRole = targetSeat.role;
            const isDemon = targetRole?.type === 'demon' || targetSeat.isDemonSuccessor;

            if (isDemon) {
                killPlayer(targetSeatId, {
                    skipGameOverCheck: false,
                    onAfterKill: () => {
                        logMessage += ` -> 🎯 命中！恶魔死亡！`;
                        addLog(logMessage);
                        addLog(`猎手的子弹击中了恶魔，按照规则游戏立即结束`);
                        setWinReason('猎手击杀恶魔');
                        alert(`🎯 杀手射击成功！\n${targetSeatId + 1}号 [${targetRole?.name || '未知'}] 死亡！`);
                    }
                });
            } else {
                logMessage += ` -> 💨 未命中 (目标不是恶魔)`;
                addLog(logMessage);
                alert(`💨 杀手射击失败。\n目标不是恶魔 (或免疫)。`);
            }
        } else if (meta.effectType === 'kill' && targetSeatId !== undefined) {
            const targetSeat = seats.find(s => s.id === targetSeatId);
            if (targetSeat) {
                logMessage += ` 对 ${targetSeatId + 1}号使用`;
                killPlayer(targetSeatId);
                addLog(logMessage);
            }
        } else if (meta.effectType === 'transform_ability') {
            if (sourceSeat.role?.id === 'philosopher') {
                setCurrentModal({
                    type: 'ROLE_SELECT',
                    data: {
                        type: 'philosopher',
                        targetId: sourceSeatId,
                        onConfirm: (roleId: string) => {
                            if (isAntagonismEnabled(seats)) {
                                const decision = checkCannotGainAbility({
                                    seats,
                                    gainerRoleId: sourceSeat.role?.id || 'unknown',
                                    abilityRoleId: roleId,
                                    roles,
                                });
                                if (!decision.allowed) {
                                    alert(decision.reason);
                                    addLog(`⛔ ${decision.reason}（哲学家本次使用视作已消耗）`);
                                    return;
                                }
                            }

                            changeRole(sourceSeatId, roleId, roles);
                            logMessage += ` 获得了 [${roles.find(r => r.id === roleId)?.name || roleId}] 的能力`;
                            addLog(logMessage);
                        },
                    },
                });
            } else {
                alert("🧠 变身逻辑待UI配合 (需选择角色列表)");
            }
        } else {
            addLog(logMessage);
        }
    }, [seats, saveHistory, killPlayer, setSeats, addLog, setWinReason, changeRole, roles, setCurrentModal]);

    return useMemo(() => ({
        executeNomination,
        handleVirginGuideConfirm,
        handleDayAction,
        handleDrunkCharadeSelect,
        registerVotes,
        handleDayAbilityTrigger,
        checkGameOverSimple,
        handleDayAbility,
    }), [
        executeNomination, handleVirginGuideConfirm, handleDayAction,
        handleDrunkCharadeSelect, registerVotes, handleDayAbilityTrigger,
        checkGameOverSimple, handleDayAbility
    ]);
}
