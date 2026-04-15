/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { groupedRoles, type Role, roles, type Seat } from "../../app/data";
import { useGameContext } from "../contexts/GameContext";
import { getRoleDefinition } from "../roles";
import type { GameRecord } from "../types/game";
import {
  addPoisonMark,
  computeIsPoisoned,
  getAliveNeighbors,
  getMisinformation,
  getRandom,
  getSeatPosition,
  isActionAbility,
  isActorDisabledByPoisonOrDrunk,
  isEvil,
  isGoodAlignment,
} from "../utils/gameRules";
import { unifiedEventBus } from "../utils/unifiedEventBus";
import { executePoisonAction } from "./roleActionHandlers";
import { useAbilityState } from "./useAbilityState";
import { useConfirmHandlers } from "./useConfirmHandlers";
import { useDayActions } from "./useDayActions";
import { useExecutionHandlers } from "./useExecutionHandlers";
import { useGameFlow } from "./useGameFlow";
import { useGameRecords } from "./useGameRecords";
import { useGameState } from "./useGameState";
import { useHistoryController } from "./useHistoryController";
import { useInteractionHandler } from "./useInteractionHandler";
import { useLogicDispatcher } from "./useLogicDispatcher";
import { useNightActionHandler } from "./useNightActionHandler";
import { useNightEngine } from "./useNightEngine";
import { useNightSnapshot } from "./useNightSnapshot";
import { useRegistrationManager } from "./useRegistrationManager";
import { useSeatManager } from "./useSeatManager";
import { useSetupManager } from "./useSetupManager";
import { useVillageState } from "./useVillageState";

const cleanseSeatStatuses = (
  seat: Seat,
  opts?: { keepDeathState?: boolean }
): Seat => {
  const preservedDetails = (seat.statusDetails || []).filter(
    (detail) => detail === "永久中毒"
  );
  const preservedStatuses = (seat.statuses || []).filter(
    (st) => st.duration === "permanent"
  );
  return {
    ...seat,
    isPoisoned: preservedDetails.includes("永久中毒"),
    isDrunk: false,
    isSentenced: false,
    hasAbilityEvenDead: false,
    isEvilConverted: false,
    isGoodConverted: false,
    statusDetails: preservedDetails,
    statuses: preservedStatuses,
    isFirstDeathForZombuul: opts?.keepDeathState
      ? seat.isFirstDeathForZombuul
      : false,
    isDead: opts?.keepDeathState ? seat.isDead : false,
  };
};

const addDrunkMark = (seat: Seat, drunkType: string, clearTime: string) => {
  const details = seat.statusDetails || [];
  const statuses = seat.statuses || [];
  const markText = `${drunkType}致醉${clearTime}清除`;
  return {
    statusDetails: [...details.filter((d) => !d.includes(drunkType)), markText],
    statuses: [...statuses, { effect: "Drunk", duration: clearTime }],
  };
};

const _getSeatRoleId = (seat?: Seat | null): string | null => {
  if (!seat) return null;
  const role = seat.role?.id === "drunk" ? seat.charadeRole : seat.role;
  return role ? role.id : null;
};

export function useGameController() {
  const gameState = useGameState();
  const {
    seats,
    setSeats,
    initialSeats,
    setInitialSeats,
    gamePhase,
    setGamePhase,
    nightCount,
    setNightCount,
    deadThisNight,
    setDeadThisNight,
    selectedScript,
    wakeQueueIds,
    setWakeQueueIds,
    currentWakeIndex,
    setCurrentWakeIndex,
    currentModal,
    setCurrentModal,
    isVortoxWorld,
    setIsVortoxWorld,
    lastDuskExecution,
    setLastDuskExecution,
    poppyGrowerDead,
    spyDisguiseMode,
    spyDisguiseProbability,
    balloonistKnownTypes,
    setBalloonistKnownTypes,
    todayDemonVoted,
    setTodayDemonVoted,
    todayMinionNominated,
    setTodayMinionNominated,
    todayExecutedId,
    setTodayExecutedId,
    votedThisRound,
    setVotedThisRound,
    outsiderDiedToday,
    setOutsiderDiedToday,
    gameLogs,
    setGameLogs,
    executedPlayerId,
    setExecutedPlayerId,
    currentDuskExecution,
    setCurrentDuskExecution,
    hasExecutedThisDay,
    setHasExecutedThisDay,
    selectedActionTargets,
    setSelectedActionTargets,
    gossipTrueTonight,
    gossipSourceSeatId,
    pukkaPoisonQueue,
    setPukkaPoisonQueue,
    poChargeState,
    setPoChargeState,
    winResult,
    setWinResult,
    winReason,
    setWinReason,
    startTime,
    setStartTime,
    timer,
    setTimer,
    klutzChoiceTarget,
    setKlutzChoiceTarget,
    hadesiaChoices,
    setHadesiaChoices,
    mastermindFinalDay,
    setMastermindFinalDay,
    goonDrunkedThisNight,
    setGoonDrunkedThisNight,
    nominationMap,
    setNominationMap,
    nominationRecords,
    setNominationRecords,
    voteRecords,
    setVoteRecords,
    nightOrderPreview,
    nightQueuePreviewTitle,
    setNightQueuePreviewTitle,
    selectedRole,
    setInspectionResultKey,
    victorySnapshot,
    setVictorySnapshot,
    setMayorRedirectTarget,
    setGameRecords,
    setIsPortrait,
    setMounted,
    mounted,
    setVoteInputValue,
    setShowVoteErrorToast,
    balloonistCompletedIds,
    setBalloonistCompletedIds,
    currentHint,
    setInspectionResult,
    setWitchActive,
    setWitchCursedId,
    setCerenovusTarget,
    setPendingNightQueue,
    setNightOrderPreview,
    witchActive,
    witchCursedId,
    cerenovusTarget,
  } = gameState;

  const getSeatRoleId = useCallback(
    (seatOrId: Seat | number | null | undefined) => {
      if (typeof seatOrId === "number") {
        const s = seats.find((x) => x.id === seatOrId);
        return s?.role?.id || null;
      }
      return seatOrId?.role?.id || null;
    },
    [seats]
  );

  const getDisplayRoleType = useCallback((seat: Seat | null | undefined) => {
    if (!seat) return "townsfolk";
    const role = seat.role?.id === "drunk" ? seat.charadeRole : seat.role;
    return role?.type || "townsfolk";
  }, []);

  const formatTimer = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  const { dispatch: baseDispatch } = useGameContext();

  const findNearestAliveNeighbor = useCallback(
    (originId: number, direction: 1 | -1) => {
      const originIndex = seats.findIndex((s) => s.id === originId);
      if (originIndex === -1 || seats.length <= 1) return null;
      for (let step = 1; step < seats.length; step++) {
        const seat =
          seats[(originIndex + direction * step + seats.length) % seats.length];
        if (!seat.isDead && seat.id !== originId) return seat;
      }
      return null;
    },
    [seats]
  );
  const seatManager = useSeatManager();
  const historyController = useHistoryController();
  const village = useVillageState();
  const abilities = useAbilityState(nightCount, setSeats);
  const registration = useRegistrationManager(
    gamePhase,
    nightCount,
    spyDisguiseMode,
    spyDisguiseProbability
  );
  const gameFlow = useGameFlow();
  const nightActionHandler = useNightActionHandler();
  const setupManager = useSetupManager(seats, setSeats);

  const setGameRecordsProp = useCallback(
    (val: React.SetStateAction<GameRecord[]>) => {
      setGameRecords((prev) =>
        typeof val === "function" ? (val as any)(prev) : val
      );
    },
    [setGameRecords]
  );
  const { loadGameRecords, saveGameRecord } = useGameRecords({
    setGameRecords: setGameRecordsProp,
  });

  const { changeRole, swapRoles, reviveSeat } = seatManager;
  const { saveHistory, handleStepBack, handleGlobalUndo } = historyController;
  const {
    hasUsedAbility,
    markAbilityUsed,
    hasUsedDailyAbility,
    markDailyAbilityUsed,
  } = abilities;
  const {
    registrationCacheRef,
    resetRegistrationCache,
    getRegistrationCached,
  } = registration;
  const {
    handleSwitchScript,
    handleNewGame,
    closeNightOrderPreview,
    confirmNightOrderPreview,
    proceedToFirstNight,
    proceedToCheckPhase,
    handlePreStartNight,
    handleStartNight,
    handleTimerPause,
    handleTimerStart,
    handleTimerReset,
    isTimerRunning,
    enterDayPhase,
    enterDuskPhase,
    handleDayEndTransition,
    confirmNightDeathReport,
  } = gameFlow;

  const addLog = useCallback(
    (msg: string) =>
      village.setGameLogs((p) => [
        ...(p as any),
        { day: nightCount, phase: gamePhase, message: msg },
      ]),
    [village, nightCount, gamePhase]
  );

  const addLogWithDeduplication = useCallback(
    (msg: string, playerId?: number, roleName?: string) => {
      village.setGameLogs((prev: any[]) => {
        const filtered =
          playerId !== undefined && roleName
            ? prev.filter(
                (log) =>
                  !(
                    log.message.includes(`${playerId + 1}号(${roleName})`) &&
                    log.phase === gamePhase
                  )
              )
            : prev;
        return [
          ...filtered,
          { day: nightCount, phase: gamePhase, message: msg },
        ];
      });
    },
    [village, nightCount, gamePhase]
  );

  const insertIntoWakeQueueAfterCurrent = useCallback(
    (id: number, opts?: { roleOverride?: Role | null; logLabel?: string }) => {
      setWakeQueueIds((prev: number[]) => {
        if (prev.includes(id)) return prev;
        const processed = prev.slice(0, currentWakeIndex + 1);
        const rest = prev.slice(currentWakeIndex + 1);
        const effectiveRole =
          opts?.roleOverride || seats.find((s) => s.id === id)?.role;
        if (!effectiveRole) return [...processed, id, ...rest];
        const getOrder = (sid: number) => {
          const s = seats.find((x) => x.id === sid);
          const r = s?.role?.id === "drunk" ? s.charadeRole : s?.role;
          return gamePhase === "firstNight"
            ? (r?.firstNightOrder ?? 999)
            : (r?.otherNightOrder ?? 999);
        };
        const order =
          gamePhase === "firstNight"
            ? (effectiveRole.firstNightOrder ?? 999)
            : (effectiveRole.otherNightOrder ?? 999);
        const insertAt = rest.findIndex((rid) => order < getOrder(rid));
        const nextRest = [...rest];
        if (insertAt >= 0) nextRest.splice(insertAt, 0, id);
        else nextRest.push(id);
        return [...processed, ...nextRest];
      });
      if (opts?.logLabel) addLog(`${opts.logLabel} 已加入本夜唤醒队列`);
    },
    [gamePhase, currentWakeIndex, seats, setWakeQueueIds, addLog]
  );

  const killPlayer = useCallback(
    (targetId: number, options: any = {}) => {
      const {
        source = "ability",
        recordNightDeath = true,
        onAfterKill,
      } = options;

      // 首先处理死亡逻辑
      setSeats((prev: Seat[]) => {
        let updatedSeats = prev.map((s) =>
          s.id === targetId && !s.isDead
            ? { ...s, isDead: true, diedOnDay: nightCount, deathSource: source }
            : s
        );

        // 红罗刹死亡自动转移逻辑
        const targetSeat = updatedSeats.find((s) => s.id === targetId);
        if (targetSeat?.isRedHerring) {
          // 检查是否存在存活的占卜师
          const hasFortuneTeller = updatedSeats.some(
            (s) => s.role?.id === "fortune_teller" && !s.isDead
          );
          if (hasFortuneTeller) {
            // 筛选所有存活的善良玩家（镇民/外来者），排除刚死亡的红罗刹
            const goodCandidates = updatedSeats.filter(
              (s) =>
                !s.isDead &&
                ["townsfolk", "outsider"].includes(s.role?.type || "") &&
                isGoodAlignment(s) &&
                s.id !== targetId
            );
            if (goodCandidates.length > 0) {
              const newRedHerring = getRandom(goodCandidates);
              updatedSeats = updatedSeats.map((s) => ({
                ...s,
                isRedHerring: s.id === newRedHerring.id,
                isFortuneTellerRedHerring: s.id === newRedHerring.id,
                statusDetails:
                  s.id === newRedHerring.id
                    ? [...(s.statusDetails || []), "天敌红罗剎"]
                    : (s.statusDetails || []).filter((d) => d !== "天敌红罗剎"),
              }));
              addLog(
                `天敌红罗剎已从${targetId + 1}号转移至${newRedHerring.id + 1}号玩家`
              );
            }
          }
        }

        // 占卜师死亡时，移除所有红罗刹状态
        if (targetSeat?.role?.id === "fortune_teller") {
          const hadRedHerring = updatedSeats.some(
            (s) => s.isRedHerring || s.isFortuneTellerRedHerring
          );
          if (hadRedHerring) {
            updatedSeats = updatedSeats.map((s) => ({
              ...s,
              isRedHerring: false,
              isFortuneTellerRedHerring: false,
              statusDetails: (s.statusDetails || []).filter(
                (d) => d !== "天敌红罗剎"
              ),
            }));
            addLog("占卜师已死亡，红罗刹状态已移除");
          }
        }

        return updatedSeats;
      });

      if (recordNightDeath)
        setDeadThisNight((prev: number[]) =>
          prev.includes(targetId) ? prev : [...prev, targetId]
        );
      if (getSeatRoleId(targetId) === "outsider") setOutsiderDiedToday(true);
      if (onAfterKill) onAfterKill();
    },
    [
      setSeats,
      setDeadThisNight,
      nightCount,
      setOutsiderDiedToday,
      getSeatRoleId,
      addLog,
    ]
  );

  const convertPlayerToEvil = useCallback(
    (targetId: number) => {
      setSeats((prev: Seat[]) =>
        prev.map((s) =>
          s.id === targetId
            ? cleanseSeatStatuses(
                {
                  ...s,
                  isEvilConverted: true,
                  isDemonSuccessor: false,
                  charadeRole: null,
                },
                { keepDeathState: true }
              )
            : s
        )
      );
      insertIntoWakeQueueAfterCurrent(targetId, {
        logLabel: `${targetId + 1}号转为邪恶`,
      });
    },
    [setSeats, insertIntoWakeQueueAfterCurrent]
  );

  const enqueueRavenkeeperIfNeeded = useCallback(
    (targetId: number) => {
      if (getSeatRoleId(targetId) !== "ravenkeeper") return;
      setWakeQueueIds((prev: number[]) =>
        prev.includes(targetId)
          ? prev
          : [
              ...prev.slice(0, currentWakeIndex + 1),
              targetId,
              ...prev.slice(currentWakeIndex + 1),
            ]
      );
    },
    [currentWakeIndex, setWakeQueueIds, getSeatRoleId]
  );

  const cleanStatusesForNewDay = useCallback(() => {
    setSeats((prev: Seat[]) =>
      prev.map((s) => {
        const remaining = (s.statuses || []).filter(
          (st) => st.effect === "ExecutionProof" || st.duration !== "Night"
        );
        const details = (s.statusDetails || []).filter(
          (st) =>
            st.includes("永久") ||
            st.includes("普卡中毒") ||
            !st.includes("清除")
        );
        return {
          ...s,
          statuses: remaining,
          statusDetails: details,
          isPoisoned: computeIsPoisoned({
            ...s,
            statuses: remaining,
            statusDetails: details,
          }),
        };
      })
    );
  }, [setSeats]);

  const getDemonDisplayName = useCallback((id?: string, f?: string) => {
    const map: any = {
      hadesia: "哈迪寂亚",
      vigormortis: "亡骨魔",
      imp: "小恶魔",
      zombuul: "僵怖",
      shabaloth: "沙巴洛斯",
      fang_gu: "方古",
      no_dashii: "诺-达",
      vortox: "涡流",
      po: "珀",
    };
    return map[id || ""] || f || "恶魔";
  }, []);

  const { logicDispatch, checkGameOver, declareMayorImmediateWin } =
    useLogicDispatcher(
      seats,
      setSeats,
      gamePhase,
      setGamePhase,
      addLog,
      setWinResult,
      setWinReason,
      setCurrentModal,
      setExecutedPlayerId,
      setTodayExecutedId,
      setCurrentDuskExecution,
      setHasExecutedThisDay,
      isVortoxWorld,
      setVictorySnapshot
    );

  const nightSnapshot = useNightSnapshot(
    seats,
    selectedScript,
    gamePhase,
    setGamePhase,
    nightCount,
    lastDuskExecution,
    isEvil,
    poppyGrowerDead,
    spyDisguiseMode,
    spyDisguiseProbability,
    deadThisNight,
    balloonistKnownTypes,
    registrationCacheRef.current,
    isVortoxWorld,
    todayDemonVoted,
    todayMinionNominated,
    todayExecutedId,
    hasUsedAbility,
    votedThisRound,
    outsiderDiedToday,
    wakeQueueIds,
    setCurrentWakeIndex,
    addLog,
    setCurrentModal
  );
  const {
    activeNightStep: nightInfo,
    continueToNextAction,
    wakeIndexRef,
  } = nightSnapshot;

  const nightLogic = useNightEngine(
    {
      seats,
      gamePhase,
      nightCount,
      executedPlayerId,
      wakeQueueIds,
      currentWakeIndex,
      selectedActionTargets,
      gameLogs,
      selectedScript,
      deadThisNight,
      currentDuskExecution,
      pukkaPoisonQueue,
      todayDemonVoted,
      todayMinionNominated,
      todayExecutedId,
      witchCursedId,
      witchActive,
      cerenovusTarget,
      voteRecords,
      nominationMap,
      poChargeState,
      goonDrunkedThisNight,
      isVortoxWorld,
      outsiderDiedToday,
      nightInfo,
      nightQueuePreviewTitle: gameState.nightQueuePreviewTitle,
    },
    {
      setSeats,
      setGamePhase,
      setNightCount,
      setWakeQueueIds,
      setCurrentWakeIndex,
      setSelectedActionTargets,
      setInspectionResult,
      setDeadThisNight,
      setLastDuskExecution,
      setCurrentDuskExecution,
      setPukkaPoisonQueue,
      setTodayDemonVoted,
      setTodayMinionNominated,
      setTodayExecutedId,
      setWitchCursedId,
      setWitchActive,
      setCerenovusTarget,
      setVoteRecords,
      setNominationMap,
      setGoonDrunkedThisNight,
      setIsVortoxWorld,
      setCurrentModal,
      setPendingNightQueue,
      setNightOrderPreview,
      setNightQueuePreviewTitle: gameState.setNightQueuePreviewTitle,
      setStartTime,
      setMayorRedirectTarget,
      setWinResult,
      setWinReason,
      addLog,
      addLogWithDeduplication,
      killPlayer,
      saveHistory,
      resetRegistrationCache,
      getSeatRoleId,
      getDemonDisplayName,
      enqueueRavenkeeperIfNeeded,
      continueToNextAction,
      currentWakeIndexRef: wakeIndexRef,
    }
  );

  const getRoleTargetCount = useCallback(
    (roleId: string, isFirstNight: boolean) => {
      const def = getRoleDefinition(roleId);
      const val = isFirstNight ? def?.firstNight || def?.night : def?.night;
      return val?.target
        ? { min: val.target.count.min, max: val.target.count.max }
        : null;
    },
    []
  );

  const executionHandlers = useExecutionHandlers({
    seats,
    roles,
    nightInfo,
    currentModal,
    gamePhase,
    nightCount,
    nominationMap,
    initialSeats,
    voteRecords,
    isVortoxWorld,
    todayExecutedId,
    mastermindFinalDay,
    winResult,
    winReason,
    setCurrentModal,
    setSeats,
    setSelectedActionTargets,
    setOutsiderDiedToday,
    setWakeQueueIds,
    setDeadThisNight,
    setTodayDemonVoted,
    setTodayExecutedId,
    setVotedThisRound,
    setNominationRecords,
    setNominationMap,
    setWinResult,
    setWinReason,
    setGamePhase,
    setMastermindFinalDay,
    setVoteInputValue,
    setShowVoteErrorToast,
    addLog,
    addLogWithDeduplication,
    killPlayer,
    continueToNextAction,
    checkGameOver,
    isActorDisabledByPoisonOrDrunk,
    getRegistrationCached,
    saveHistory,
    dispatch: logicDispatch,
    getRandom,
    getAliveNeighbors,
    isGoodAlignment,
    addPoisonMark,
    computeIsPoisoned,
    handleNightAction: nightActionHandler.handleNightAction,
    executePoisonActionFn: executePoisonAction,
    enqueueRavenkeeperIfNeeded,
    nightLogic,
    getMisinformation,
    findNearestAliveNeighbor,
    processingRef: { current: false } as any,
    moonchildChainPendingRef: gameState.moonchildChainPendingRef,
    markAbilityUsed,
    hasUsedAbility,
    reviveSeat,
    insertIntoWakeQueueAfterCurrent,
  });
  const {
    executePlayer,
    confirmKill,
    submitVotes,
    executeJudgment,
    confirmPoison,
    confirmPoisonEvil,
    confirmExecutionResult,
    resolveLunaticRps,
    confirmShootResult,
    handleSlayerTargetSelect,
  } = executionHandlers;

  const confirmHandlers = useConfirmHandlers({
    nightInfo,
    currentModal,
    seats,
    gamePhase,
    nightCount,
    currentWakeIndex,
    wakeQueueIds,
    deadThisNight,
    klutzChoiceTarget,
    hadesiaChoices,
    currentHint,
    isVortoxWorld,
    gameLogs,
    selectedScript,
    startTime,
    timer,
    setCurrentModal,
    setSeats,
    setSelectedActionTargets,
    setKlutzChoiceTarget,
    setHadesiaChoices,
    setInspectionResult,
    setInspectionResultKey,
    setWakeQueueIds,
    setCurrentWakeIndex,
    setWinResult,
    setWinReason,
    setGamePhase,
    addLog,
    addLogWithDeduplication,
    killPlayer,
    continueToNextAction,
    checkGameOver,
    isEvil,
    isActorDisabledByPoisonOrDrunk,
    addDrunkMark,
    getDemonDisplayName,
    executePlayer,
    saveGameRecord,
    nightLogic,
    moonchildChainPendingRef: gameState.moonchildChainPendingRef,
  });
  const {
    confirmMayorRedirect,
    confirmHadesiaKill,
    confirmMoonchildKill,
    confirmSweetheartDrunk,
    confirmKlutzChoice,
    confirmStorytellerDeath,
    confirmHadesia,
    confirmSaintExecution,
    cancelSaintExecution,
    confirmRavenkeeperFake,
    confirmVirginTrigger,
    confirmRestart,
  } = confirmHandlers;

  const dayActions = useDayActions({
    seats,
    roles,
    currentModal,
    gamePhase,
    nominationMap,
    nominationRecords,
    witchActive,
    witchCursedId,
    virginGuideInfo: gameState.virginGuideInfo,
    dayAbilityForm: gameState.dayAbilityForm,
    setCurrentModal,
    setSeats,
    setNominationMap,
    setNominationRecords,
    setTodayMinionNominated,
    setVirginGuideInfo: gameState.setVirginGuideInfo,
    setWitchCursedId,
    setWitchActive,
    setVoteInputValue,
    setShowVoteErrorToast,
    setExecutedPlayerId,
    setTodayExecutedId,
    setHasExecutedThisDay,
    setCurrentDuskExecution,
    setVfxTrigger: gameState.setVfxTrigger,
    setWinResult,
    setWinReason,
    setGamePhase,
    setDayAbilityForm: gameState.setDayAbilityForm,
    setVotedThisRound,
    addLog,
    killPlayer,
    checkGameOver,
    isActorDisabledByPoisonOrDrunk,
    getRegistrationCached: registration.getRegistrationCached,
    saveHistory,
    hasUsedAbility,
    hasUsedDailyAbility,
    markAbilityUsed,
    markDailyAbilityUsed,
    continueToNextAction,
    proceedToFirstNight,
    changeRole,
    dispatch: logicDispatch,
  });
  const {
    executeNomination,
    handleVirginGuideConfirm,
    handleDayAction,
    handleDrunkCharadeSelect,
    registerVotes,
    handleDayAbilityTrigger,
    handleDayAbility,
  } = dayActions;

  const interactionHandlers = useInteractionHandler({
    getRoleTargetCount,
    handleConfirmActionImpl: (selectedTargets?: number[]) => {
      const result = nightActionHandler.handleNightAction({
        nightInfo,
        seats,
        selectedTargets: selectedTargets || [],
        gamePhase,
        nightCount,
        roles: roles || [],
        vortoxWorld: isVortoxWorld,
        getRegistration: getRegistrationCached,
        getMisinformation: getMisinformation,
        findNearestAliveNeighbor,
        setSeats,
        setSelectedActionTargets,
        addLog,
        continueToNextAction,
        setCurrentModal,
        markAbilityUsed,
        hasUsedAbility,
        reviveSeat,
        insertIntoWakeQueueAfterCurrent,
      });
      if (!result) continueToNextAction();
    },
    nightInfo,
  });
  const {
    handleSeatClick: interactionHandleSeatClick,
    toggleStatus: interactionToggleStatus,
    handleMenuAction,
    toggleTarget: interactionToggleTarget,
    isTargetDisabled,
    handleConfirmAction: interactionHandleConfirmAction,
  } = interactionHandlers;

  const getDisplayRoleForSeat = useCallback(
    (seat?: Seat | null): Role | null => {
      const raw = seat?.role?.id === "drunk" ? seat.charadeRole : seat?.role;
      return raw || null;
    },
    []
  );

  const getFilteredRoles = useCallback(
    (list: Role[]) => {
      if (!selectedScript) return [];

      // 如果剧本有 roleIds 字段（包括自定义和官方剧本），直接使用它过滤
      if (selectedScript.roleIds && selectedScript.roleIds.length > 0) {
        const filtered = list.filter((r) =>
          selectedScript.roleIds?.includes(r.id)
        );
        console.log(
          `[DEBUG] Script "${selectedScript.name}" filtered ${filtered.length} roles via roleIds`
        );
        return filtered;
      }

      // 否则回退到旧的 script 字段过滤（向后兼容）
      // 跳过隐藏角色
      const filtered = list.filter((r) => {
        if (r.hidden) return false;

        // 如果没有 script 字段，检查是否属于暗流涌动剧本
        if (!r.script) {
          return selectedScript.id === "trouble_brewing";
        }

        // 有 script 字段：检查是否匹配当前剧本名称
        const matches = r.script === selectedScript.name;
        if (!matches && process.env.NODE_ENV === "development") {
          console.log(
            `[DEBUG] Role ${r.id} (script: "${r.script}") doesn't match script "${selectedScript.name}"`
          );
        }
        return matches;
      });

      console.log(
        `[DEBUG] Official script "${selectedScript.name}" (id: "${selectedScript.id}") filtered ${filtered.length} roles via script field`
      );
      if (process.env.NODE_ENV === "development" && filtered.length === 0) {
        console.log("[DEBUG] Available roles with script fields:");
        list.slice(0, 10).forEach((r) => {
          console.log(`  ${r.id}: script="${r.script}", hidden=${r.hidden}`);
        });
      }

      return filtered;
    },
    [selectedScript]
  );

  const filteredGroupedRoles = useMemo(() => {
    if (!selectedScript) return {} as Record<string, Role[]>;
    return Array.from(
      new Map(getFilteredRoles(roles).map((r) => [r.id, r])).values()
    ).reduce(
      (acc, r) => {
        if (!acc[r.type]) {
          acc[r.type] = [];
        }
        acc[r.type].push(r);
        return acc;
      },
      {} as Record<string, Role[]>
    );
  }, [selectedScript, getFilteredRoles]);

  const onSeatClick = useCallback(
    (id: number, options?: any) => {
      if (gamePhase === "setup" || gamePhase === "scriptSelection") {
        if (selectedRole) {
          const existing = seats.find((s) => s.role?.id === selectedRole.id);
          if (existing) {
            if (existing.id === id) changeRole(id, "", roles);
            return;
          }
          changeRole(id, selectedRole.id, roles);
        } else {
          setSeats((prev) =>
            prev.map((s) =>
              s.id === id ? { ...s, role: null, displayRole: null } : s
            )
          );
        }
      } else {
        interactionHandleSeatClick(id, options);
      }
    },
    [
      gamePhase,
      selectedRole,
      seats,
      changeRole,
      interactionHandleSeatClick,
      setSeats,
    ]
  );

  useEffect(() => {
    setIsVortoxWorld(
      seats.some(
        (s) =>
          !s.isDead &&
          (s.role?.id === "vortox" ||
            (s.isDemonSuccessor && s.role?.id === "vortox"))
      )
    );
  }, [seats, setIsVortoxWorld]);
  useEffect(() => {
    if (gamePhase === "scriptSelection")
      (gameState as any).triggerIntroLoading?.();
  }, [gamePhase, (gameState as any).triggerIntroLoading]);

  useEffect(() => {
    if (gamePhase !== "firstNight" && gamePhase !== "night") return;
    if (currentWakeIndex >= (wakeQueueIds?.length || 0)) {
      if (
        selectedScript?.id === "bad_moon_rising" &&
        gossipTrueTonight &&
        gossipSourceSeatId !== null
      ) {
        if (currentModal?.type !== "STORYTELLER_SELECT") {
          setCurrentModal({
            type: "STORYTELLER_SELECT",
            data: {
              sourceId: gossipSourceSeatId,
              roleId: "gossip",
              roleName: "造谣者",
              description: "说书人：造谣为真，请选择 1 名玩家死亡。",
            },
          } as any);
        }
      } else if (currentModal?.type !== "NIGHT_DEATH_REPORT") {
        // 夜晚结束，进入黎明报告阶段
        const msg =
          deadThisNight.length > 0
            ? `昨晚${deadThisNight.map((id) => `${id + 1}号`).join("、")}玩家死亡`
            : "昨天是个平安夜";

        // 直接设置游戏阶段和模态框，避免使用baseDispatch可能导致的冲突
        setGamePhase("dawnReport");
        setCurrentModal({
          type: "NIGHT_DEATH_REPORT",
          data: { message: msg },
        });
      }
    }
  }, [
    currentWakeIndex,
    wakeQueueIds,
    gamePhase,
    deadThisNight,
    gossipTrueTonight,
    gossipSourceSeatId,
    selectedScript,
    currentModal,
    setGamePhase,
    setCurrentModal,
  ]);

  const seatContainerRef = useRef<HTMLDivElement>(null);
  const consoleContentRef = useRef<HTMLDivElement>(null);
  const currentActionTextRef = useRef<HTMLDivElement>(null);
  const seatRefs = useRef<Record<number, HTMLDivElement>>({});

  useEffect(() => {
    if (!mounted) return;
    const checkOrientation = () =>
      setIsPortrait(window.innerHeight > window.innerWidth);
    checkOrientation();
    window.addEventListener("resize", checkOrientation);
    return () => window.removeEventListener("resize", checkOrientation);
  }, [mounted, setIsPortrait]);

  useEffect(() => {
    const all = ["镇民", "外来者", "爪牙", "恶魔"];
    const newly: number[] = [];
    for (const [id, known] of Object.entries(balloonistKnownTypes)) {
      if (
        all.every((l) => known.includes(l)) &&
        !balloonistCompletedIds.includes(Number(id))
      ) {
        newly.push(Number(id));
      }
    }
    if (newly.length > 0) {
      for (const id of newly) {
        addLog(`气球驾驶员${id + 1}号得知所有类型，今后不再被唤醒`);
      }
      setBalloonistCompletedIds((prev: number[]) => [...prev, ...newly]);
    }
  }, [
    balloonistKnownTypes,
    balloonistCompletedIds,
    addLog,
    setBalloonistCompletedIds,
  ]);

  // 初始化座位：当进入setup阶段且座位为空时，创建16个默认座位
  useEffect(() => {
    if (gamePhase === "setup" && seats.length === 0) {
      const defaultSeats: Seat[] = Array.from({ length: 16 }, (_, i) => ({
        id: i,
        playerName: `玩家 ${i + 1}`,
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
        hasUsedVirginAbility: false,
        isDemonSuccessor: false,
        hasAbilityEvenDead: false,
        statusDetails: [],
        statuses: [],
        voteCount: 0,
        isCandidate: false,
        grandchildId: null,
        isGrandchild: false,
        isFirstDeathForZombuul: false,
        isZombuulTrulyDead: false,
        zombuulLives: 1,
      }));
      setSeats(defaultSeats);
      setInitialSeats(defaultSeats);
      console.log("DEBUG: 初始化了16个默认座位");
    }
  }, [gamePhase, seats.length, setSeats, setInitialSeats]);

  // 监听首夜启动事件，触发首夜队列生成
  useEffect(() => {
    const handleStartFirstNight = () => {
      console.log("[GameController] Received startFirstNight event");
      nightLogic.startNight(true);
    };
    const listenerId = unifiedEventBus.on(
      "startFirstNight",
      handleStartFirstNight
    );
    return () => {
      unifiedEventBus.off("startFirstNight", listenerId);
    };
  }, [nightLogic]);

  // 初始化夜晚第一步信息
  useEffect(() => {
    if (
      (gamePhase === "firstNight" || gamePhase === "night") &&
      wakeQueueIds.length > 0 &&
      currentWakeIndex === 0 &&
      !nightInfo
    ) {
      console.log("[GameController] Initializing first night step");
      nightSnapshot.updateSnapshot(0, seats, gamePhase);
    }
  }, [
    gamePhase,
    wakeQueueIds,
    currentWakeIndex,
    nightInfo,
    seats,
    nightSnapshot,
  ]);

  return useMemo(
    () => ({
      ...gameState,
      addLog,
      logicDispatch,
      checkGameOver,
      currentNightRole: nightInfo?.effectiveRole?.name,
      nextNightRole: (nightInfo as any)?.nextRoleName,
      nightOrderPreviewLive: (gameState.nightOrderPreview || []).map(
        (s) => s.role?.name || "未知"
      ),
      nightInfo,
      getDemonDisplayName,
      killPlayer,
      nightLogic,
      changeRole,
      swapRoles,
      handlePreStartNight,
      handleStartNight,
      handleDrunkCharadeSelect,
      proceedToCheckPhase,
      reviveSeat,
      convertPlayerToEvil,
      insertIntoWakeQueueAfterCurrent,
      executePlayer,
      confirmKill,
      submitVotes,
      executeJudgment,
      confirmPoison,
      confirmPoisonEvil,
      confirmExecutionResult,
      enterDuskPhase,
      resolveLunaticRps,
      confirmShootResult,
      handleSlayerTargetSelect,
      confirmMayorRedirect,
      confirmHadesiaKill,
      confirmMoonchildKill,
      confirmSweetheartDrunk,
      confirmKlutzChoice,
      confirmStorytellerDeath,
      confirmHadesia,
      confirmSaintExecution,
      cancelSaintExecution,
      confirmRavenkeeperFake,
      confirmVirginTrigger,
      confirmRestart,
      executeNomination,
      handleDayAction,
      handleVirginGuideConfirm,
      handleDayAbilityTrigger,
      handleDayAbility,
      registerVotes,
      confirmNightDeathReport,
      victorySnapshot,
      handleRestart: () =>
        setCurrentModal({ type: "RESTART_CONFIRM", data: null }),
      handleSwitchScript,
      handleNewGame,
      handleStepBack,
      handleGlobalUndo,
      closeNightOrderPreview,
      confirmNightOrderPreview: () => {
        // 首先调用原始的confirmNightOrderPreview函数
        confirmNightOrderPreview();

        // 然后调用nightLogic.finalizeNightStart来开始夜晚
        // 注意：我们需要从pendingNightQueue中获取队列
        if (
          gameState.pendingNightQueue &&
          gameState.pendingNightQueue.length > 0
        ) {
          console.log(
            "[GameController] Calling finalizeNightStart with pending queue"
          );
          nightLogic.finalizeNightStart(gameState.pendingNightQueue, true);
        } else {
          console.warn(
            "[GameController] No pendingNightQueue found, cannot start night"
          );
        }
      },
      proceedToFirstNight,
      onSeatClick,
      toggleStatus: interactionToggleStatus,
      handleMenuAction,
      handleConfirmAction: interactionHandleConfirmAction,
      toggleTarget: interactionToggleTarget,
      handleDayEndTransition,
      getSeatRoleId,
      formatTimer,
      getDisplayRoleType,
      setHadesiaChoice: (id: number, c: "live" | "die") =>
        setHadesiaChoices((prev: any) => ({ ...prev, [id]: c })),
      setRedNemesisTarget: (tid: number) =>
        setSeats((prev) =>
          prev.map((s) => ({
            ...s,
            isRedHerring: s.id === tid,
            isFortuneTellerRedHerring: s.id === tid,
            statusDetails:
              s.id === tid
                ? [...(s.statusDetails || []), "天敌红罗剎"]
                : (s.statusDetails || []).filter((d) => d !== "天敌红罗剎"),
          }))
        ),
      handleTimerPause,
      handleTimerStart,
      handleTimerReset,
      isTimerRunning,
      isTargetDisabled,
      groupedRoles,
      isGoodAlignment,
      getSeatPosition,
      hasUsedAbility,
      hasUsedDailyAbility,
      isActionAbility,
      isActorDisabledByPoisonOrDrunk,
      addLogWithDeduplication,
      continueToNextAction,
      saveHistory,
      enterDayPhase,
      loadGameRecords,
      saveGameRecord,
      cleanStatusesForNewDay,
      enqueueRavenkeeperIfNeeded,
      resetRegistrationCache,
      getRegistrationCached,
      getFilteredRoles,
      markAbilityUsed,
      markDailyAbilityUsed,
      getDisplayRoleForSeat,
      filteredGroupedRoles,
      seatContainerRef,
      consoleContentRef,
      currentActionTextRef,
      seatRefs,
      declareMayorImmediateWin,
      cleanseSeatStatuses,
      ...setupManager,
    }),
    [
      gameState,
      addLog,
      logicDispatch,
      nightInfo,
      getDemonDisplayName,
      killPlayer,
      nightLogic,
      onSeatClick,
      interactionToggleStatus,
      handleMenuAction,
      interactionToggleTarget,
      isTargetDisabled,
      interactionHandleConfirmAction,
      continueToNextAction,
      saveHistory,
      enterDayPhase,
      loadGameRecords,
      saveGameRecord,
      cleanStatusesForNewDay,
      enqueueRavenkeeperIfNeeded,
      resetRegistrationCache,
      getRegistrationCached,
      getFilteredRoles,
      markAbilityUsed,
      markDailyAbilityUsed,
      getDisplayRoleForSeat,
      filteredGroupedRoles,
      hasUsedAbility,
      hasUsedDailyAbility,
      addLogWithDeduplication,
      setupManager,
      cancelSaintExecution,
      changeRole,
      checkGameOver,
      closeNightOrderPreview,
      confirmExecutionResult,
      confirmHadesia,
      confirmHadesiaKill,
      confirmKill,
      confirmKlutzChoice,
      confirmMayorRedirect,
      confirmMoonchildKill,
      confirmNightDeathReport,
      confirmNightOrderPreview,
      confirmPoison,
      confirmPoisonEvil,
      confirmRavenkeeperFake,
      confirmRestart,
      confirmSaintExecution,
      confirmShootResult,
      confirmStorytellerDeath,
      confirmSweetheartDrunk,
      confirmVirginTrigger,
      convertPlayerToEvil,
      declareMayorImmediateWin,
      enterDuskPhase,
      executeJudgment,
      executeNomination,
      executePlayer,
      formatTimer,
      getDisplayRoleType,
      getSeatRoleId,
      handleDayAbility,
      handleDayAbilityTrigger,
      handleDayAction,
      handleDayEndTransition,
      handleDrunkCharadeSelect,
      handleGlobalUndo,
      handleNewGame,
      handlePreStartNight,
      handleSlayerTargetSelect,
      handleStartNight,
      handleStepBack,
      handleSwitchScript,
      handleTimerPause,
      handleTimerReset,
      handleTimerStart,
      handleVirginGuideConfirm,
      insertIntoWakeQueueAfterCurrent,
      isTimerRunning,
      proceedToCheckPhase,
      proceedToFirstNight,
      registerVotes,
      resolveLunaticRps,
      reviveSeat,
      setCurrentModal,
      setHadesiaChoices,
      setSeats,
      submitVotes,
      swapRoles,
      victorySnapshot,
    ]
  );
}
