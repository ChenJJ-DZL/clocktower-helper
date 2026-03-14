"use client";

import { useCallback, useMemo, useRef } from "react";
import type {
  GamePhase,
  LogEntry,
  Role,
  Script,
  Seat,
  WinResult,
} from "../../app/data";
import {
  gameActions,
  useGameContext,
  type VfxTrigger,
} from "../contexts/GameContext";
import type { GameRecord, NightHintState } from "../types/game";
import type { ModalType } from "../types/modal";
import type { RegistrationResult } from "../types/registration";

/**
 * 游戏状态管理 Hook
 * 现已重构为 GameContext 的包装器，确保单一数据源
 */
export function useGameState() {
  const { state, dispatch, currentQueueIndexRef } = useGameContext();

  // Alias for backward compatibility
  const currentWakeIndexRef = currentQueueIndexRef;

  // ===========================
  //      STATE 别名 (保持兼容)
  // ===========================
  const {
    mounted,
    showIntroLoading,
    isPortrait,
    seats,
    initialSeats,
    victorySnapshot,
    gamePhase,
    selectedScript,
    nightCount,
    deadThisNight,
    executedPlayerId,
    gameLogs,
    winResult,
    winReason,
    startTime,
    timer,
    selectedRole,
    contextMenu,
    showMenu,
    longPressingSeats,
    wakeQueueIds,
    currentWakeIndex,
    selectedActionTargets,
    inspectionResult,
    inspectionResultKey,
    currentHint,
    todayDemonVoted,
    todayMinionNominated,
    todayExecutedId,
    witchCursedId,
    witchActive,
    cerenovusTarget,
    isVortoxWorld,
    fangGuConverted,
    jugglerGuesses,
    evilTwinPair,
    outsiderDiedToday,
    gossipStatementToday,
    gossipTrueTonight,
    gossipSourceSeatId,
    currentModal,
    dayAbilityForm,
    baronSetupCheck,
    ignoreBaronSetup,
    compositionError,
    voteInputValue,
    showVoteErrorToast,
    gameRecords,
    mayorRedirectTarget,
    nightOrderPreview,
    pendingNightQueue,
    nightQueuePreviewTitle,
    firstNightOrder,
    poppyGrowerDead,
    klutzChoiceTarget,
    lastExecutedPlayerId,
    damselGuessed,
    shamanKeyword,
    shamanTriggered,
    shamanConvertTarget,
    spyDisguiseMode,
    spyDisguiseProbability,
    pukkaPoisonQueue,
    poChargeState,
    autoRedHerringInfo,
    dayAbilityLogs,
    damselGuessUsedBy,
    usedOnceAbilities,
    usedDailyAbilities,
    nominationMap,
    balloonistKnownTypes,
    balloonistCompletedIds,
    hadesiaChoices,
    virginGuideInfo,
    seatNotes,
    voteRecords,
    votedThisRound,
    hasExecutedThisDay,
    mastermindFinalDay,
    remainingDays,
    goonDrunkedThisNight,
    nominationRecords,
    lastDuskExecution,
    currentDuskExecution,
    history,
    hadesiaChoiceEnabled,
    vfxTrigger,
  } = state;

  // ===========================
  //      SETTER 包装器
  // ===========================
  const setMounted = useCallback(
    (val: boolean) => dispatch(gameActions.updateState({ mounted: val })),
    [dispatch]
  );
  const setShowIntroLoading = useCallback(
    (val: boolean) =>
      dispatch(gameActions.updateState({ showIntroLoading: val })),
    [dispatch]
  );
  const setIsPortrait = useCallback(
    (val: boolean) => dispatch(gameActions.updateState({ isPortrait: val })),
    [dispatch]
  );
  const setSeats = useCallback(
    (val: Seat[] | ((prev: Seat[]) => Seat[])) => {
      if (typeof val === "function") {
        dispatch(gameActions.setSeats(val(state.seats)));
      } else {
        dispatch(gameActions.setSeats(val));
      }
    },
    [dispatch, state.seats]
  );
  const setInitialSeats = useCallback(
    (val: Seat[]) => dispatch(gameActions.updateState({ initialSeats: val })),
    [dispatch]
  );
  const setVictorySnapshot = useCallback(
    (val: Seat[]) =>
      dispatch(gameActions.updateState({ victorySnapshot: val })),
    [dispatch]
  );
  const setGamePhase: React.Dispatch<React.SetStateAction<GamePhase>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: GamePhase) => GamePhase)(state.gamePhase)
            : val;
        dispatch(gameActions.setGamePhase(next));
      },
      [dispatch, state.gamePhase]
    );
  const setSelectedScript = useCallback(
    (val: Script | null) =>
      dispatch(gameActions.updateState({ selectedScript: val })),
    [dispatch]
  );
  const setNightCount = useCallback(
    (val: number | ((prev: number) => number)) => {
      const next = typeof val === "function" ? val(state.nightCount) : val;
      dispatch(gameActions.updateState({ nightCount: next }));
    },
    [dispatch, state.nightCount]
  );
  const setDeadThisNight: React.Dispatch<React.SetStateAction<number[]>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: number[]) => number[])(state.deadThisNight)
            : val;
        dispatch(gameActions.setDeadThisNight(next));
      },
      [dispatch, state.deadThisNight]
    );
  const setExecutedPlayerId: React.Dispatch<
    React.SetStateAction<number | null>
  > = useCallback(
    (val) => {
      const next =
        typeof val === "function"
          ? (val as (p: number | null) => number | null)(state.executedPlayerId)
          : val;
      dispatch(gameActions.setExecutedPlayer(next));
    },
    [dispatch, state.executedPlayerId]
  );
  const setGameLogs: React.Dispatch<React.SetStateAction<LogEntry[]>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: LogEntry[]) => LogEntry[])(state.gameLogs)
            : val;
        dispatch(gameActions.updateState({ gameLogs: next }));
      },
      [dispatch, state.gameLogs]
    );
  const setWinResult: React.Dispatch<React.SetStateAction<WinResult | null>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: WinResult | null) => WinResult | null)(
                state.winResult
              )
            : val;
        dispatch(gameActions.setWinResult(next, state.winReason));
      },
      [dispatch, state.winResult, state.winReason]
    );
  const setWinReason: React.Dispatch<React.SetStateAction<string | null>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: string | null) => string | null)(state.winReason)
            : val;
        dispatch(gameActions.setWinResult(state.winResult, next));
      },
      [dispatch, state.winResult, state.winReason]
    );
  const setStartTime: React.Dispatch<React.SetStateAction<Date | null>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: Date | null) => Date | null)(state.startTime)
            : val;
        dispatch(gameActions.setStartTime(next));
      },
      [dispatch, state.startTime]
    );
  const setTimer: React.Dispatch<React.SetStateAction<number>> = useCallback(
    (val) => {
      const next =
        typeof val === "function"
          ? (val as (p: number) => number)(state.timer)
          : val;
      dispatch(gameActions.setTimer(next));
    },
    [dispatch, state.timer]
  );
  const setSelectedRole: React.Dispatch<React.SetStateAction<Role | null>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: Role | null) => Role | null)(state.selectedRole)
            : val;
        dispatch(gameActions.updateState({ selectedRole: next }));
      },
      [dispatch, state.selectedRole]
    );
  const setContextMenu: React.Dispatch<React.SetStateAction<any>> = useCallback(
    (val) => {
      const next =
        typeof val === "function"
          ? (val as (p: any) => any)(state.contextMenu)
          : val;
      dispatch(gameActions.updateState({ contextMenu: next }));
    },
    [dispatch, state.contextMenu]
  );
  const setShowMenu: React.Dispatch<React.SetStateAction<boolean>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: boolean) => boolean)(state.showMenu)
            : val;
        dispatch(gameActions.updateState({ showMenu: next }));
      },
      [dispatch, state.showMenu]
    );
  const setLongPressingSeats: React.Dispatch<
    React.SetStateAction<Set<number>>
  > = useCallback(
    (val) => {
      const next =
        typeof val === "function"
          ? (val as (p: Set<number>) => Set<number>)(state.longPressingSeats)
          : val;
      dispatch(gameActions.updateState({ longPressingSeats: next }));
    },
    [dispatch, state.longPressingSeats]
  );
  const setWakeQueueIds: React.Dispatch<React.SetStateAction<number[]>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: number[]) => number[])(state.wakeQueueIds)
            : val;
        dispatch(gameActions.updateState({ wakeQueueIds: next }));
      },
      [dispatch, state.wakeQueueIds]
    );
  const setCurrentWakeIndex: React.Dispatch<React.SetStateAction<number>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: number) => number)(state.currentWakeIndex)
            : val;
        dispatch(gameActions.setCurrentQueueIndex(next));
      },
      [dispatch, state.currentWakeIndex]
    );
  const setSelectedActionTargets: React.Dispatch<
    React.SetStateAction<number[]>
  > = useCallback(
    (val) => {
      const next =
        typeof val === "function"
          ? (val as (p: number[]) => number[])(state.selectedActionTargets)
          : val;
      dispatch(gameActions.setSelectedTargets(next));
    },
    [dispatch, state.selectedActionTargets]
  );
  const setInspectionResult: React.Dispatch<
    React.SetStateAction<string | null>
  > = useCallback(
    (val) => {
      const next =
        typeof val === "function"
          ? (val as (p: string | null) => string | null)(state.inspectionResult)
          : val;
      if (next === state.inspectionResult) return;
      dispatch(gameActions.setInspectionResult(next));
    },
    [dispatch, state.inspectionResult]
  );
  const setInspectionResultKey: React.Dispatch<React.SetStateAction<number>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: number) => number)(state.inspectionResultKey)
            : val;
        dispatch(gameActions.updateState({ inspectionResultKey: next }));
      },
      [dispatch, state.inspectionResultKey]
    );
  const setCurrentHint: React.Dispatch<React.SetStateAction<NightHintState>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: NightHintState) => NightHintState)(state.currentHint)
            : val;
        if (next === state.currentHint) return;
        dispatch(gameActions.setCurrentHint(next));
      },
      [dispatch, state.currentHint]
    );
  const setTodayDemonVoted: React.Dispatch<React.SetStateAction<boolean>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: boolean) => boolean)(state.todayDemonVoted)
            : val;
        dispatch(gameActions.updateState({ todayDemonVoted: next }));
      },
      [dispatch, state.todayDemonVoted]
    );
  const setTodayMinionNominated: React.Dispatch<React.SetStateAction<boolean>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: boolean) => boolean)(state.todayMinionNominated)
            : val;
        dispatch(gameActions.updateState({ todayMinionNominated: next }));
      },
      [dispatch, state.todayMinionNominated]
    );
  const setTodayExecutedId: React.Dispatch<
    React.SetStateAction<number | null>
  > = useCallback(
    (val) => {
      const next =
        typeof val === "function"
          ? (val as (p: number | null) => number | null)(state.todayExecutedId)
          : val;
      dispatch(gameActions.updateState({ todayExecutedId: next }));
    },
    [dispatch, state.todayExecutedId]
  );
  const setWitchCursedId: React.Dispatch<React.SetStateAction<number | null>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: number | null) => number | null)(state.witchCursedId)
            : val;
        dispatch(gameActions.updateState({ witchCursedId: next }));
      },
      [dispatch, state.witchCursedId]
    );
  const setWitchActive: React.Dispatch<React.SetStateAction<boolean>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: boolean) => boolean)(state.witchActive)
            : val;
        dispatch(gameActions.updateState({ witchActive: next }));
      },
      [dispatch, state.witchActive]
    );
  const setCerenovusTarget: React.Dispatch<React.SetStateAction<any>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: any) => any)(state.cerenovusTarget)
            : val;
        dispatch(gameActions.updateState({ cerenovusTarget: next }));
      },
      [dispatch, state.cerenovusTarget]
    );
  const setIsVortoxWorld: React.Dispatch<React.SetStateAction<boolean>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: boolean) => boolean)(state.isVortoxWorld)
            : val;
        dispatch(gameActions.updateState({ isVortoxWorld: next }));
      },
      [dispatch, state.isVortoxWorld]
    );
  const setFangGuConverted = useCallback(
    (val: boolean) =>
      dispatch(gameActions.updateState({ fangGuConverted: val })),
    [dispatch]
  );
  const setJugglerGuesses = useCallback(
    (val: any) => dispatch(gameActions.updateState({ jugglerGuesses: val })),
    [dispatch]
  );
  const setEvilTwinPair = useCallback(
    (val: any) => dispatch(gameActions.updateState({ evilTwinPair: val })),
    [dispatch]
  );
  const setOutsiderDiedToday = useCallback(
    (val: boolean) => dispatch(gameActions.setOutsiderDiedToday(val)),
    [dispatch]
  );
  const setGossipStatementToday = useCallback(
    (val: string) =>
      dispatch(
        gameActions.setGossipState(
          val,
          state.gossipTrueTonight,
          state.gossipSourceSeatId
        )
      ),
    [dispatch, state.gossipTrueTonight, state.gossipSourceSeatId]
  );
  const setGossipTrueTonight = useCallback(
    (val: boolean) =>
      dispatch(
        gameActions.setGossipState(
          state.gossipStatementToday,
          val,
          state.gossipSourceSeatId
        )
      ),
    [dispatch, state.gossipStatementToday, state.gossipSourceSeatId]
  );
  const setGossipSourceSeatId = useCallback(
    (val: number | null) =>
      dispatch(
        gameActions.setGossipState(
          state.gossipStatementToday,
          state.gossipTrueTonight,
          val
        )
      ),
    [dispatch, state.gossipStatementToday, state.gossipTrueTonight]
  );
  const setCurrentModal: React.Dispatch<React.SetStateAction<ModalType>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: ModalType) => ModalType)(state.currentModal)
            : val;
        dispatch(gameActions.setModal(next));
      },
      [dispatch, state.currentModal]
    );
  const setDayAbilityForm = useCallback(
    (val: any) => dispatch(gameActions.updateState({ dayAbilityForm: val })),
    [dispatch]
  );
  const setBaronSetupCheck: React.Dispatch<React.SetStateAction<any>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: any) => any)(state.baronSetupCheck)
            : val;
        dispatch(gameActions.updateState({ baronSetupCheck: next }));
      },
      [dispatch, state.baronSetupCheck]
    );
  const setIgnoreBaronSetup = useCallback(
    (val: boolean) =>
      dispatch(gameActions.updateState({ ignoreBaronSetup: val })),
    [dispatch]
  );
  const setCompositionError: React.Dispatch<React.SetStateAction<any>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: any) => any)(state.compositionError)
            : val;
        dispatch(gameActions.updateState({ compositionError: next }));
      },
      [dispatch, state.compositionError]
    );
  const setVoteInputValue = useCallback(
    (val: string) => dispatch(gameActions.setVoteInput(val)),
    [dispatch]
  );
  const setShowVoteErrorToast = useCallback(
    (val: boolean) =>
      dispatch(gameActions.updateState({ showVoteErrorToast: val })),
    [dispatch]
  );
  const setGameRecords: React.Dispatch<React.SetStateAction<GameRecord[]>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: GameRecord[]) => GameRecord[])(state.gameRecords)
            : val;
        dispatch(gameActions.setGameRecords(next));
      },
      [dispatch, state.gameRecords]
    );
  const setMayorRedirectTarget: React.Dispatch<
    React.SetStateAction<number | null>
  > = useCallback(
    (val) => {
      const next =
        typeof val === "function"
          ? (val as (p: number | null) => number | null)(
              state.mayorRedirectTarget
            )
          : val;
      dispatch(gameActions.updateState({ mayorRedirectTarget: next }));
    },
    [dispatch, state.mayorRedirectTarget]
  );
  const setNightOrderPreview: React.Dispatch<
    React.SetStateAction<{ roleName: string; seatNo: number; order: number }[]>
  > = useCallback(
    (val) => {
      const next =
        typeof val === "function"
          ? (
              val as (
                p: { roleName: string; seatNo: number; order: number }[]
              ) => { roleName: string; seatNo: number; order: number }[]
            )(state.nightOrderPreview)
          : val;
      dispatch(gameActions.updateState({ nightOrderPreview: next }));
    },
    [dispatch, state.nightOrderPreview]
  );
  const setPendingNightQueue = useCallback(
    (val: Seat[] | null | ((p: Seat[] | null) => Seat[] | null)) => {
      const next =
        typeof val === "function"
          ? (val as (p: Seat[] | null) => Seat[] | null)(
              state.pendingNightQueue
            )
          : val;
      dispatch(gameActions.updateState({ pendingNightQueue: next }));
    },
    [dispatch, state.pendingNightQueue]
  );
  const setNightQueuePreviewTitle = useCallback(
    (val: string | ((p: string) => string)) => {
      const next =
        typeof val === "function"
          ? (val as (p: string) => string)(state.nightQueuePreviewTitle)
          : val;
      dispatch(gameActions.updateState({ nightQueuePreviewTitle: next }));
    },
    [dispatch, state.nightQueuePreviewTitle]
  );
  const setFirstNightOrder = useCallback(
    (val: any[]) => dispatch(gameActions.updateState({ firstNightOrder: val })),
    [dispatch]
  );
  const setPoppyGrowerDead: React.Dispatch<React.SetStateAction<boolean>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: boolean) => boolean)(state.poppyGrowerDead)
            : val;
        dispatch(gameActions.updateState({ poppyGrowerDead: next }));
      },
      [dispatch, state.poppyGrowerDead]
    );
  const setKlutzChoiceTarget = useCallback(
    (val: number | null | ((p: number | null) => number | null)) => {
      const next =
        typeof val === "function"
          ? (val as (p: number | null) => number | null)(
              state.klutzChoiceTarget
            )
          : val;
      dispatch(gameActions.updateState({ klutzChoiceTarget: next }));
    },
    [dispatch, state.klutzChoiceTarget]
  );
  const setLastExecutedPlayerId = useCallback(
    (val: number | null) =>
      dispatch(gameActions.updateState({ lastExecutedPlayerId: val })),
    [dispatch]
  );
  const setDamselGuessed = useCallback(
    (val: boolean) => dispatch(gameActions.updateState({ damselGuessed: val })),
    [dispatch]
  );
  const setShamanKeyword = useCallback(
    (val: string | null) =>
      dispatch(gameActions.updateState({ shamanKeyword: val })),
    [dispatch]
  );
  const setShamanTriggered = useCallback(
    (val: boolean) =>
      dispatch(gameActions.updateState({ shamanTriggered: val })),
    [dispatch]
  );
  const setShamanConvertTarget = useCallback(
    (val: number | null) =>
      dispatch(gameActions.updateState({ shamanConvertTarget: val })),
    [dispatch]
  );
  const setSpyDisguiseMode = useCallback(
    (val: "off" | "default" | "on") =>
      dispatch(gameActions.updateState({ spyDisguiseMode: val })),
    [dispatch]
  );
  const setSpyDisguiseProbability = useCallback(
    (val: number) =>
      dispatch(gameActions.updateState({ spyDisguiseProbability: val })),
    [dispatch]
  );
  const setPukkaPoisonQueue = useCallback(
    (val: any[] | ((prev: any[]) => any[])) => {
      const next =
        typeof val === "function" ? val(state.pukkaPoisonQueue) : val;
      dispatch(gameActions.updatePukkaQueue(next));
    },
    [dispatch, state.pukkaPoisonQueue]
  );
  const setPoChargeState = useCallback(
    (val: any) => dispatch(gameActions.updateState({ poChargeState: val })),
    [dispatch]
  );
  const setAutoRedHerringInfo = useCallback(
    (val: string | null) =>
      dispatch(gameActions.updateState({ autoRedHerringInfo: val })),
    [dispatch]
  );
  const setDayAbilityLogs = useCallback(
    (val: any) => dispatch(gameActions.updateState({ dayAbilityLogs: val })),
    [dispatch]
  );
  const setDamselGuessUsedBy = useCallback(
    (val: number[] | ((prev: number[]) => number[])) => {
      const next =
        typeof val === "function" ? val(state.damselGuessUsedBy) : val;
      dispatch(gameActions.updateState({ damselGuessUsedBy: next }));
    },
    [dispatch, state.damselGuessUsedBy]
  );
  const setUsedOnceAbilities: React.Dispatch<
    React.SetStateAction<Record<string, number[]>>
  > = useCallback(
    (val) => {
      const next =
        typeof val === "function"
          ? (val as (p: Record<string, number[]>) => Record<string, number[]>)(
              state.usedOnceAbilities
            )
          : val;
      dispatch(gameActions.updateState({ usedOnceAbilities: next }));
    },
    [dispatch, state.usedOnceAbilities]
  );
  const setUsedDailyAbilities: React.Dispatch<
    React.SetStateAction<Record<string, { day: number; seats: number[] }>>
  > = useCallback(
    (val) => {
      const next =
        typeof val === "function"
          ? (
              val as (
                p: Record<string, { day: number; seats: number[] }>
              ) => Record<string, { day: number; seats: number[] }>
            )(state.usedDailyAbilities)
          : val;
      dispatch(gameActions.updateState({ usedDailyAbilities: next }));
    },
    [dispatch, state.usedDailyAbilities]
  );
  const setNominationMap: React.Dispatch<
    React.SetStateAction<Record<number, number>>
  > = useCallback(
    (val) => {
      const next =
        typeof val === "function"
          ? (val as (p: Record<number, number>) => Record<number, number>)(
              state.nominationMap
            )
          : val;
      dispatch(gameActions.updateState({ nominationMap: next }));
    },
    [dispatch, state.nominationMap]
  );
  const setBalloonistKnownTypes: React.Dispatch<
    React.SetStateAction<Record<number, string[]>>
  > = useCallback(
    (val) => {
      const next =
        typeof val === "function"
          ? (val as (p: Record<number, string[]>) => Record<number, string[]>)(
              state.balloonistKnownTypes
            )
          : val;
      if (next === state.balloonistKnownTypes) return;
      dispatch(gameActions.updateState({ balloonistKnownTypes: next }));
    },
    [dispatch, state.balloonistKnownTypes]
  );
  const setBalloonistCompletedIds = useCallback(
    (val: number[] | ((prev: number[]) => number[])) => {
      const next =
        typeof val === "function" ? val(state.balloonistCompletedIds) : val;
      dispatch(gameActions.updateState({ balloonistCompletedIds: next }));
    },
    [dispatch, state.balloonistCompletedIds]
  );
  const setHadesiaChoices: React.Dispatch<
    React.SetStateAction<Record<number, "live" | "die">>
  > = useCallback(
    (val) => {
      const next =
        typeof val === "function"
          ? (
              val as (
                p: Record<number, "live" | "die">
              ) => Record<number, "live" | "die">
            )(state.hadesiaChoices)
          : val;
      dispatch(gameActions.updateState({ hadesiaChoices: next }));
    },
    [dispatch, state.hadesiaChoices]
  );
  const setVirginGuideInfo: React.Dispatch<React.SetStateAction<any>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: any) => any)(state.virginGuideInfo)
            : val;
        dispatch(gameActions.updateState({ virginGuideInfo: next }));
      },
      [dispatch, state.virginGuideInfo]
    );
  const setVoteRecords = useCallback(
    (val: any[] | ((prev: any[]) => any[])) => {
      const next = typeof val === "function" ? val(state.voteRecords) : val;
      dispatch(gameActions.updateState({ voteRecords: next }));
    },
    [dispatch, state.voteRecords]
  );
  const setVotedThisRound = useCallback(
    (val: number[] | ((prev: number[]) => number[])) => {
      const next = typeof val === "function" ? val(state.votedThisRound) : val;
      dispatch(gameActions.updateState({ votedThisRound: next }));
    },
    [dispatch, state.votedThisRound]
  );
  const setHasExecutedThisDay: React.Dispatch<React.SetStateAction<boolean>> =
    useCallback(
      (val) => {
        const next =
          typeof val === "function"
            ? (val as (p: boolean) => boolean)(state.hasExecutedThisDay)
            : val;
        dispatch(gameActions.updateState({ hasExecutedThisDay: next }));
      },
      [dispatch, state.hasExecutedThisDay]
    );
  const setMastermindFinalDay = useCallback(
    (val: any) =>
      dispatch(gameActions.updateState({ mastermindFinalDay: val })),
    [dispatch]
  );
  const setRemainingDays = useCallback(
    (val: number | null | ((p: number | null) => number | null)) => {
      const next =
        typeof val === "function"
          ? (val as (p: number | null) => number | null)(state.remainingDays)
          : val;
      dispatch(gameActions.updateState({ remainingDays: next }));
    },
    [dispatch, state.remainingDays]
  );
  const setGoonDrunkedThisNight = useCallback(
    (val: boolean | ((p: boolean) => boolean)) => {
      const next =
        typeof val === "function"
          ? (val as (p: boolean) => boolean)(state.goonDrunkedThisNight)
          : val;
      dispatch(gameActions.updateState({ goonDrunkedThisNight: next }));
    },
    [dispatch, state.goonDrunkedThisNight]
  );
  const setHistory = useCallback(
    (val: any[]) => dispatch(gameActions.setHistory(val)),
    [dispatch]
  );
  const setNominationRecords: React.Dispatch<
    React.SetStateAction<{ nominators: Set<number>; nominees: Set<number> }>
  > = useCallback(
    (val) => {
      const next =
        typeof val === "function"
          ? (
              val as (p: {
                nominators: Set<number>;
                nominees: Set<number>;
              }) => { nominators: Set<number>; nominees: Set<number> }
            )(state.nominationRecords)
          : val;
      dispatch(gameActions.setNominationRecords(next));
    },
    [dispatch, state.nominationRecords]
  );
  const setLastDuskExecution: React.Dispatch<
    React.SetStateAction<number | null>
  > = useCallback(
    (val) => {
      const next =
        typeof val === "function"
          ? (val as (p: number | null) => number | null)(
              state.lastDuskExecution
            )
          : val;
      dispatch(gameActions.setDuskExecution(next, state.currentDuskExecution));
    },
    [dispatch, state.currentDuskExecution, state.lastDuskExecution]
  );
  const setCurrentDuskExecution: React.Dispatch<
    React.SetStateAction<number | null>
  > = useCallback(
    (val) => {
      const next =
        typeof val === "function"
          ? (val as (p: number | null) => number | null)(
              state.currentDuskExecution
            )
          : val;
      dispatch(gameActions.setDuskExecution(state.lastDuskExecution, next));
    },
    [dispatch, state.lastDuskExecution, state.currentDuskExecution]
  );
  const setSeatNotes: React.Dispatch<
    React.SetStateAction<Record<number, string>>
  > = useCallback(
    (val) => {
      const next =
        typeof val === "function"
          ? (val as (p: Record<number, string>) => Record<number, string>)(
              state.seatNotes
            )
          : val;
      dispatch(gameActions.updateState({ seatNotes: next }));
    },
    [dispatch, state.seatNotes]
  );
  const setHadesiaChoiceEnabled = useCallback(
    (val: boolean) =>
      dispatch(gameActions.updateState({ hadesiaChoiceEnabled: val })),
    [dispatch]
  );
  const setVfxTrigger = useCallback(
    (val: VfxTrigger) => dispatch({ type: "SET_VFX_TRIGGER", trigger: val }),
    [dispatch]
  );

  const checkLongPressTimerRef = useRef<NodeJS.Timeout | null>(null); // 核对身份列表长按定时器
  const longPressTriggeredRef = useRef<Set<number>>(new Set()); // 座位长按是否已触发（避免短按被阻断）
  const seatContainerRef = useRef<HTMLDivElement | null>(null); // 椭圆桌容器
  const seatRefs = useRef<Record<number, HTMLDivElement | null>>({}); // 每个座位元素引用

  // 保存每个角色的 hint 信息，用于上一夜时恢复（不重新生成）
  const hintCacheRef = useRef<Map<string, NightHintState>>(new Map());
  // 记录酒鬼是否首次获得信息（首次一定是假的）
  const drunkFirstInfoRef = useRef<Map<number, boolean>>(new Map());

  // [REFACTOR] seatsRef removed - all state reads must go through Context
  const fakeInspectionResultRef = useRef<string | null>(null);
  const consoleContentRef = useRef<HTMLDivElement>(null);
  const currentActionTextRef = useRef<HTMLSpanElement>(null);
  const moonchildChainPendingRef = useRef(false);
  const longPressTimerRef = useRef<Map<number, NodeJS.Timeout>>(new Map()); // 存储每个座位的长按定时器
  const registrationCacheRef = useRef<Map<string, RegistrationResult>>(
    new Map()
  ); // 同夜查验结果缓存
  const registrationCacheKeyRef = useRef<string>("");
  const introTimeoutRef = useRef<any>(null);

  // 历史记录、提名记录、处决记录已从 state 中解构

  // [REFACTOR] gameStateRef removed - all state reads must go through Context

  // 返回所有状态和 setter
  // CRITICAL PERFORMANCE: Memoize the entire return object to prevent cascading re-renders
  return useMemo(
    () => ({
      // useState 状态
      mounted,
      setMounted,
      showIntroLoading,
      setShowIntroLoading,
      isPortrait,
      setIsPortrait,
      seats,
      setSeats,
      initialSeats,
      setInitialSeats,
      victorySnapshot,
      setVictorySnapshot,
      gamePhase,
      setGamePhase,
      selectedScript,
      setSelectedScript,
      nightCount,
      setNightCount,
      deadThisNight,
      setDeadThisNight,
      executedPlayerId,
      setExecutedPlayerId,
      gameLogs,
      setGameLogs,
      winResult,
      setWinResult,
      winReason,
      setWinReason,
      startTime,
      setStartTime,
      timer,
      setTimer,
      selectedRole,
      setSelectedRole,
      contextMenu,
      setContextMenu,
      showMenu,
      setShowMenu,
      longPressingSeats,
      setLongPressingSeats,
      wakeQueueIds,
      setWakeQueueIds,
      currentWakeIndex,
      setCurrentWakeIndex,
      selectedActionTargets,
      setSelectedActionTargets,
      inspectionResult,
      setInspectionResult,
      inspectionResultKey,
      setInspectionResultKey,
      currentHint,
      setCurrentHint,
      vfxTrigger,
      setVfxTrigger,
      todayDemonVoted,
      setTodayDemonVoted,
      todayMinionNominated,
      setTodayMinionNominated,
      todayExecutedId,
      setTodayExecutedId,
      witchCursedId,
      setWitchCursedId,
      witchActive,
      setWitchActive,
      cerenovusTarget,
      setCerenovusTarget,
      isVortoxWorld,
      setIsVortoxWorld,
      fangGuConverted,
      setFangGuConverted,
      jugglerGuesses,
      setJugglerGuesses,
      evilTwinPair,
      setEvilTwinPair,
      outsiderDiedToday,
      setOutsiderDiedToday,
      gossipStatementToday,
      setGossipStatementToday,
      gossipTrueTonight,
      setGossipTrueTonight,
      gossipSourceSeatId,
      setGossipSourceSeatId,

      // ===========================
      //  统一的弹窗状态
      // ===========================
      currentModal,
      setCurrentModal,

      // ===========================
      //  保留的辅助状态（非弹窗显示状态）
      // ===========================
      dayAbilityForm,
      setDayAbilityForm,
      baronSetupCheck,
      setBaronSetupCheck,
      ignoreBaronSetup,
      setIgnoreBaronSetup,
      compositionError,
      setCompositionError,
      voteInputValue,
      setVoteInputValue,
      showVoteErrorToast,
      setShowVoteErrorToast,
      gameRecords,
      setGameRecords,
      mayorRedirectTarget,
      setMayorRedirectTarget,
      nightOrderPreview,
      setNightOrderPreview,
      pendingNightQueue,
      setPendingNightQueue,
      nightQueuePreviewTitle,
      setNightQueuePreviewTitle,
      firstNightOrder,
      setFirstNightOrder,
      poppyGrowerDead,
      setPoppyGrowerDead,
      klutzChoiceTarget,
      setKlutzChoiceTarget,
      lastExecutedPlayerId,
      setLastExecutedPlayerId,
      damselGuessed,
      setDamselGuessed,
      shamanKeyword,
      setShamanKeyword,
      shamanTriggered,
      setShamanTriggered,
      shamanConvertTarget,
      setShamanConvertTarget,
      spyDisguiseMode,
      setSpyDisguiseMode,
      spyDisguiseProbability,
      setSpyDisguiseProbability,
      pukkaPoisonQueue,
      setPukkaPoisonQueue,
      poChargeState,
      setPoChargeState,
      autoRedHerringInfo,
      setAutoRedHerringInfo,
      dayAbilityLogs,
      setDayAbilityLogs,
      damselGuessUsedBy,
      setDamselGuessUsedBy,
      usedOnceAbilities,
      setUsedOnceAbilities,
      usedDailyAbilities,
      setUsedDailyAbilities,
      nominationMap,
      setNominationMap,
      balloonistKnownTypes,
      setBalloonistKnownTypes,
      balloonistCompletedIds,
      setBalloonistCompletedIds,
      hadesiaChoices,
      setHadesiaChoices,
      seatNotes,
      setSeatNotes,
      virginGuideInfo,
      setVirginGuideInfo,
      voteRecords,
      setVoteRecords,
      votedThisRound,
      setVotedThisRound,
      hasExecutedThisDay,
      setHasExecutedThisDay,
      mastermindFinalDay,
      setMastermindFinalDay,
      remainingDays,
      setRemainingDays,
      goonDrunkedThisNight,
      setGoonDrunkedThisNight,
      currentDuskExecution,
      setCurrentDuskExecution,
      hadesiaChoiceEnabled,
      setHadesiaChoiceEnabled,
      nominationRecords,
      setNominationRecords,
      lastDuskExecution,
      setLastDuskExecution,
      history,
      setHistory,

      // useRef
      checkLongPressTimerRef,
      longPressTriggeredRef,
      seatContainerRef,
      seatRefs,
      hintCacheRef,
      drunkFirstInfoRef,
      fakeInspectionResultRef,
      consoleContentRef,
      currentActionTextRef,
      moonchildChainPendingRef,
      longPressTimerRef,
      registrationCacheRef,
      registrationCacheKeyRef,
      introTimeoutRef,
      currentWakeIndexRef,
    }),
    [
      mounted,
      isPortrait,
      seats,
      initialSeats,
      victorySnapshot,
      gamePhase,
      selectedScript,
      nightCount,
      deadThisNight,
      executedPlayerId,
      gameLogs,
      winResult,
      winReason,
      startTime,
      timer,
      selectedRole,
      contextMenu,
      showMenu,
      longPressingSeats,
      wakeQueueIds,
      currentWakeIndex,
      selectedActionTargets,
      inspectionResult,
      inspectionResultKey,
      currentHint,
      todayDemonVoted,
      todayMinionNominated,
      todayExecutedId,
      witchCursedId,
      witchActive,
      cerenovusTarget,
      isVortoxWorld,
      fangGuConverted,
      jugglerGuesses,
      evilTwinPair,
      outsiderDiedToday,
      gossipStatementToday,
      gossipTrueTonight,
      gossipSourceSeatId,
      currentModal,
      dayAbilityForm,
      baronSetupCheck,
      ignoreBaronSetup,
      compositionError,
      voteInputValue,
      showVoteErrorToast,
      gameRecords,
      mayorRedirectTarget,
      nightOrderPreview,
      pendingNightQueue,
      nightQueuePreviewTitle,
      firstNightOrder,
      poppyGrowerDead,
      klutzChoiceTarget,
      lastExecutedPlayerId,
      damselGuessed,
      shamanKeyword,
      shamanTriggered,
      shamanConvertTarget,
      spyDisguiseMode,
      spyDisguiseProbability,
      pukkaPoisonQueue,
      poChargeState,
      autoRedHerringInfo,
      dayAbilityLogs,
      damselGuessUsedBy,
      usedOnceAbilities,
      usedDailyAbilities,
      nominationMap,
      balloonistKnownTypes,
      balloonistCompletedIds,
      hadesiaChoices,
      virginGuideInfo,
      seatNotes,
      voteRecords,
      votedThisRound,
      hasExecutedThisDay,
      mastermindFinalDay,
      remainingDays,
      goonDrunkedThisNight,
      nominationRecords,
      lastDuskExecution,
      currentDuskExecution,
      history,
      hadesiaChoiceEnabled,
      currentWakeIndexRef,
      setAutoRedHerringInfo,
      setBalloonistCompletedIds,
      setBalloonistKnownTypes,
      setBaronSetupCheck,
      setCerenovusTarget,
      setCompositionError,
      setContextMenu,
      setCurrentDuskExecution,
      setCurrentHint,
      setCurrentModal,
      setCurrentWakeIndex,
      setDamselGuessUsedBy,
      setDamselGuessed,
      setDayAbilityForm,
      setDayAbilityLogs,
      setDeadThisNight,
      setEvilTwinPair,
      setExecutedPlayerId,
      setFangGuConverted,
      setFirstNightOrder,
      setGameLogs,
      setGamePhase,
      setGameRecords,
      setGoonDrunkedThisNight,
      setGossipSourceSeatId,
      setGossipStatementToday,
      setGossipTrueTonight,
      setHadesiaChoiceEnabled,
      setHadesiaChoices,
      setHasExecutedThisDay,
      setHistory,
      setIgnoreBaronSetup,
      setInitialSeats,
      setInspectionResult,
      setInspectionResultKey,
      setIsPortrait,
      setIsVortoxWorld,
      setJugglerGuesses,
      setKlutzChoiceTarget,
      setLastDuskExecution,
      setLastExecutedPlayerId,
      setLongPressingSeats,
      setMastermindFinalDay,
      setMayorRedirectTarget,
      setMounted,
      setNightCount,
      setNightOrderPreview,
      setNightQueuePreviewTitle,
      setNominationMap,
      setNominationRecords,
      setOutsiderDiedToday,
      setPendingNightQueue,
      setPoChargeState,
      setPoppyGrowerDead,
      setPukkaPoisonQueue,
      setRemainingDays,
      setSeatNotes,
      setSeats,
      setSelectedActionTargets,
      setSelectedRole,
      setSelectedScript,
      setShamanConvertTarget,
      setShamanKeyword,
      setShamanTriggered,
      setShowIntroLoading,
      setShowMenu,
      setShowVoteErrorToast,
      setSpyDisguiseMode,
      setSpyDisguiseProbability,
      setStartTime,
      setTimer,
      setTodayDemonVoted,
      setTodayExecutedId,
      setTodayMinionNominated,
      setUsedDailyAbilities,
      setUsedOnceAbilities,
      setVfxTrigger,
      setVictorySnapshot,
      setVirginGuideInfo,
      setVoteInputValue,
      setVoteRecords,
      setVotedThisRound,
      setWakeQueueIds,
      setWinReason,
      setWinResult,
      setWitchActive,
      setWitchCursedId,
      showIntroLoading,
      vfxTrigger,
    ]
  );
}
