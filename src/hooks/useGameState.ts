"use client";

import { useRef } from "react";
import { Seat, Role, GamePhase, WinResult, LogEntry, Script } from "../../app/data";
import { NightHintState, GameRecord } from "../types/game";
import { RegistrationResult } from "../utils/gameRules";
import { ModalType } from "../types/modal";
import { useGameContext, gameActions } from "../contexts/GameContext";

/**
 * 游戏状态管理 Hook
 * 现已重构为 GameContext 的包装器，确保单一数据源
 */
export function useGameState() {
  const { state, dispatch } = useGameContext();

  // ===========================
  //      STATE 别名 (保持兼容)
  // ===========================
  const {
    mounted, showIntroLoading, isPortrait, seats, initialSeats,
    gamePhase, selectedScript, nightCount, deadThisNight, executedPlayerId,
    gameLogs, winResult, winReason, startTime, timer,
    selectedRole, contextMenu, showMenu, longPressingSeats,
    wakeQueueIds, currentWakeIndex, selectedActionTargets, inspectionResult, inspectionResultKey,
    currentHint, todayDemonVoted, todayMinionNominated, todayExecutedId,
    witchCursedId, witchActive, cerenovusTarget, isVortoxWorld,
    fangGuConverted, jugglerGuesses, evilTwinPair, outsiderDiedToday,
    gossipStatementToday, gossipTrueTonight, gossipSourceSeatId,
    currentModal, showShootModal, showNominateModal, dayAbilityForm,
    baronSetupCheck, ignoreBaronSetup, compositionError, showRavenkeeperResultModal,
    showAttackBlockedModal, showBarberSwapModal, showNightDeathReportModal,
    voteInputValue, showVoteErrorToast, gameRecords, mayorRedirectTarget,
    nightOrderPreview, pendingNightQueue, nightQueuePreviewTitle, firstNightOrder,
    poppyGrowerDead, klutzChoiceTarget, showKlutzChoiceModal, showSweetheartDrunkModal,
    showMoonchildKillModal, lastExecutedPlayerId, damselGuessed, shamanKeyword,
    shamanTriggered, shamanConvertTarget, spyDisguiseMode, spyDisguiseProbability,
    pukkaPoisonQueue, poChargeState, autoRedHerringInfo, dayAbilityLogs,
    damselGuessUsedBy, usedOnceAbilities, usedDailyAbilities, nominationMap,
    balloonistKnownTypes, balloonistCompletedIds, hadesiaChoices, virginGuideInfo,
    voteRecords, votedThisRound, hasExecutedThisDay, mastermindFinalDay,
    remainingDays, goonDrunkedThisNight, nominationRecords, lastDuskExecution,
    currentDuskExecution, history, showKillConfirmModal, showMayorRedirectModal, showPitHagModal,
    showRangerModal, showDamselGuessModal, showShamanConvertModal,
    showHadesiaKillConfirmModal, showPoisonConfirmModal, showPoisonEvilConfirmModal,
    showRestartConfirmModal, showSpyDisguiseModal, showMayorThreeAliveModal,
    showDrunkModal, showVoteInputModal, showRoleSelectModal, showMadnessCheckModal,
    showDayActionModal, showDayAbilityModal, showSaintExecutionConfirmModal,
    showLunaticRpsModal, showVirginTriggerModal, showRavenkeeperFakeModal,
    showStorytellerDeathModal, showReviewModal, showGameRecordsModal,
    showRoleInfoModal, showExecutionResultModal, showShootResultModal,
    showNightOrderModal, showFirstNightOrderModal, showMinionKnowDemonModal
  } = state;

  // ===========================
  //      SETTER 包装器
  // ===========================
  const setMounted = (val: boolean) => dispatch(gameActions.updateState({ mounted: val }));
  const setShowIntroLoading = (val: boolean) => dispatch(gameActions.updateState({ showIntroLoading: val }));
  const setIsPortrait = (val: boolean) => dispatch(gameActions.updateState({ isPortrait: val }));
  const setSeats = (val: Seat[] | ((prev: Seat[]) => Seat[])) => {
    if (typeof val === 'function') {
      dispatch(gameActions.setSeats(val(state.seats)));
    } else {
      dispatch(gameActions.setSeats(val));
    }
  };
  const setInitialSeats = (val: Seat[]) => dispatch(gameActions.updateState({ initialSeats: val }));
  const setGamePhase = (val: GamePhase) => dispatch(gameActions.setGamePhase(val));
  const setSelectedScript = (val: Script | null) => dispatch(gameActions.updateState({ selectedScript: val }));
  const setNightCount = (val: number | ((prev: number) => number)) => {
    const next = typeof val === 'function' ? val(state.nightCount) : val;
    dispatch(gameActions.updateState({ nightCount: next }));
  };
  const setDeadThisNight: React.Dispatch<React.SetStateAction<number[]>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: number[]) => number[])(state.deadThisNight) : val;
    dispatch(gameActions.setDeadThisNight(next));
  };
  const setExecutedPlayerId: React.Dispatch<React.SetStateAction<number | null>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: number | null) => number | null)(state.executedPlayerId) : val;
    dispatch(gameActions.setExecutedPlayer(next));
  };
  const setGameLogs: React.Dispatch<React.SetStateAction<LogEntry[]>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: LogEntry[]) => LogEntry[])(state.gameLogs) : val;
    dispatch(gameActions.updateState({ gameLogs: next }));
  };
  const setWinResult: React.Dispatch<React.SetStateAction<WinResult | null>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: WinResult | null) => WinResult | null)(state.winResult) : val;
    dispatch(gameActions.setWinResult(next, state.winReason));
  };
  const setWinReason: React.Dispatch<React.SetStateAction<string | null>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: string | null) => string | null)(state.winReason) : val;
    dispatch(gameActions.setWinResult(state.winResult, next));
  };
  const setStartTime: React.Dispatch<React.SetStateAction<Date | null>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: Date | null) => Date | null)(state.startTime) : val;
    dispatch(gameActions.setStartTime(next));
  };
  const setTimer: React.Dispatch<React.SetStateAction<number>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: number) => number)(state.timer) : val;
    dispatch(gameActions.setTimer(next));
  };
  const setSelectedRole: React.Dispatch<React.SetStateAction<Role | null>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: Role | null) => Role | null)(state.selectedRole) : val;
    dispatch(gameActions.updateState({ selectedRole: next }));
  };
  const setContextMenu: React.Dispatch<React.SetStateAction<any>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: any) => any)(state.contextMenu) : val;
    dispatch(gameActions.updateState({ contextMenu: next }));
  };
  const setShowMenu: React.Dispatch<React.SetStateAction<boolean>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: boolean) => boolean)(state.showMenu) : val;
    dispatch(gameActions.updateState({ showMenu: next }));
  };
  const setLongPressingSeats: React.Dispatch<React.SetStateAction<Set<number>>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: Set<number>) => Set<number>)(state.longPressingSeats) : val;
    dispatch(gameActions.updateState({ longPressingSeats: next }));
  };
  const setWakeQueueIds: React.Dispatch<React.SetStateAction<number[]>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: number[]) => number[])(state.wakeQueueIds) : val;
    dispatch(gameActions.updateState({ wakeQueueIds: next }));
  };
  const setCurrentWakeIndex: React.Dispatch<React.SetStateAction<number>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: number) => number)(state.currentWakeIndex) : val;
    dispatch(gameActions.setCurrentQueueIndex(next));
  };
  const setSelectedActionTargets: React.Dispatch<React.SetStateAction<number[]>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: number[]) => number[])(state.selectedActionTargets) : val;
    dispatch(gameActions.setSelectedTargets(next));
  };
  const setInspectionResult: React.Dispatch<React.SetStateAction<string | null>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: string | null) => string | null)(state.inspectionResult) : val;
    dispatch(gameActions.setInspectionResult(next));
  };
  const setInspectionResultKey: React.Dispatch<React.SetStateAction<number>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: number) => number)(state.inspectionResultKey) : val;
    dispatch(gameActions.updateState({ inspectionResultKey: next }));
  };
  const setCurrentHint: React.Dispatch<React.SetStateAction<NightHintState>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: NightHintState) => NightHintState)(state.currentHint) : val;
    dispatch(gameActions.setCurrentHint(next));
  };
  const setTodayDemonVoted: React.Dispatch<React.SetStateAction<boolean>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: boolean) => boolean)(state.todayDemonVoted) : val;
    dispatch(gameActions.updateState({ todayDemonVoted: next }));
  };
  const setTodayMinionNominated: React.Dispatch<React.SetStateAction<boolean>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: boolean) => boolean)(state.todayMinionNominated) : val;
    dispatch(gameActions.updateState({ todayMinionNominated: next }));
  };
  const setTodayExecutedId: React.Dispatch<React.SetStateAction<number | null>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: number | null) => number | null)(state.todayExecutedId) : val;
    dispatch(gameActions.updateState({ todayExecutedId: next }));
  };
  const setWitchCursedId: React.Dispatch<React.SetStateAction<number | null>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: number | null) => number | null)(state.witchCursedId) : val;
    dispatch(gameActions.updateState({ witchCursedId: next }));
  };
  const setWitchActive: React.Dispatch<React.SetStateAction<boolean>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: boolean) => boolean)(state.witchActive) : val;
    dispatch(gameActions.updateState({ witchActive: next }));
  };
  const setCerenovusTarget: React.Dispatch<React.SetStateAction<any>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: any) => any)(state.cerenovusTarget) : val;
    dispatch(gameActions.updateState({ cerenovusTarget: next }));
  };
  const setIsVortoxWorld: React.Dispatch<React.SetStateAction<boolean>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: boolean) => boolean)(state.isVortoxWorld) : val;
    dispatch(gameActions.updateState({ isVortoxWorld: next }));
  };
  const setFangGuConverted = (val: boolean) => dispatch(gameActions.updateState({ fangGuConverted: val }));
  const setJugglerGuesses = (val: any) => dispatch(gameActions.updateState({ jugglerGuesses: val }));
  const setEvilTwinPair = (val: any) => dispatch(gameActions.updateState({ evilTwinPair: val }));
  const setOutsiderDiedToday = (val: boolean) => dispatch(gameActions.setOutsiderDiedToday(val));
  const setGossipStatementToday = (val: string) => dispatch(gameActions.setGossipState(val, state.gossipTrueTonight, state.gossipSourceSeatId));
  const setGossipTrueTonight = (val: boolean) => dispatch(gameActions.setGossipState(state.gossipStatementToday, val, state.gossipSourceSeatId));
  const setGossipSourceSeatId = (val: number | null) => dispatch(gameActions.setGossipState(state.gossipStatementToday, state.gossipTrueTonight, val));
  const setCurrentModal: React.Dispatch<React.SetStateAction<ModalType>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: ModalType) => ModalType)(state.currentModal) : val;
    dispatch(gameActions.setModal(next));
  };
  const setShowShootModal = (val: number | null) => dispatch(gameActions.updateState({ showShootModal: val }));
  const setShowNominateModal = (val: number | null) => dispatch(gameActions.updateState({ showNominateModal: val }));
  const setDayAbilityForm = (val: any) => dispatch(gameActions.updateState({ dayAbilityForm: val }));
  const setBaronSetupCheck: React.Dispatch<React.SetStateAction<any>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: any) => any)(state.baronSetupCheck) : val;
    dispatch(gameActions.updateState({ baronSetupCheck: next }));
  };
  const setIgnoreBaronSetup = (val: boolean) => dispatch(gameActions.updateState({ ignoreBaronSetup: val }));
  const setCompositionError: React.Dispatch<React.SetStateAction<any>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: any) => any)(state.compositionError) : val;
    dispatch(gameActions.updateState({ compositionError: next }));
  };
  const setShowRavenkeeperResultModal = (val: any) => dispatch(gameActions.updateState({ showRavenkeeperResultModal: val }));
  const setShowAttackBlockedModal = (val: any) => dispatch(gameActions.updateState({ showAttackBlockedModal: val }));
  const setShowBarberSwapModal = (val: any) => dispatch(gameActions.updateState({ showBarberSwapModal: val }));
  const setShowNightDeathReportModal = (val: string | null) => dispatch(gameActions.updateState({ showNightDeathReportModal: val }));
  const setVoteInputValue = (val: string) => dispatch(gameActions.setVoteInput(val));
  const setShowVoteErrorToast = (val: boolean) => dispatch(gameActions.updateState({ showVoteErrorToast: val }));
  const setGameRecords: React.Dispatch<React.SetStateAction<GameRecord[]>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: GameRecord[]) => GameRecord[])(state.gameRecords) : val;
    dispatch(gameActions.setGameRecords(next));
  };
  const setMayorRedirectTarget: React.Dispatch<React.SetStateAction<number | null>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: number | null) => number | null)(state.mayorRedirectTarget) : val;
    dispatch(gameActions.updateState({ mayorRedirectTarget: next }));
  };
  const setNightOrderPreview: React.Dispatch<React.SetStateAction<{ roleName: string; seatNo: number; order: number; }[]>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: { roleName: string; seatNo: number; order: number; }[]) => { roleName: string; seatNo: number; order: number; }[])(state.nightOrderPreview) : val;
    dispatch(gameActions.updateState({ nightOrderPreview: next }));
  };
  const setPendingNightQueue = (val: Seat[] | null | ((p: Seat[] | null) => Seat[] | null)) => {
    const next = typeof val === 'function' ? (val as (p: Seat[] | null) => Seat[] | null)(state.pendingNightQueue) : val;
    dispatch(gameActions.updateState({ pendingNightQueue: next }));
  };
  const setNightQueuePreviewTitle = (val: string | ((p: string) => string)) => {
    const next = typeof val === 'function' ? (val as (p: string) => string)(state.nightQueuePreviewTitle) : val;
    dispatch(gameActions.updateState({ nightQueuePreviewTitle: next }));
  };
  const setFirstNightOrder = (val: any[]) => dispatch(gameActions.updateState({ firstNightOrder: val }));
  const setPoppyGrowerDead: React.Dispatch<React.SetStateAction<boolean>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: boolean) => boolean)(state.poppyGrowerDead) : val;
    dispatch(gameActions.updateState({ poppyGrowerDead: next }));
  };
  const setKlutzChoiceTarget = (val: number | null | ((p: number | null) => number | null)) => {
    const next = typeof val === 'function' ? (val as (p: number | null) => number | null)(state.klutzChoiceTarget) : val;
    dispatch(gameActions.updateState({ klutzChoiceTarget: next }));
  };
  const setShowKlutzChoiceModal = (val: any) => dispatch(gameActions.updateState({ showKlutzChoiceModal: val }));
  const setShowSweetheartDrunkModal = (val: any) => dispatch(gameActions.updateState({ showSweetheartDrunkModal: val }));
  const setShowMoonchildKillModal = (val: any) => dispatch(gameActions.updateState({ showMoonchildKillModal: val }));
  const setLastExecutedPlayerId = (val: number | null) => dispatch(gameActions.updateState({ lastExecutedPlayerId: val }));
  const setDamselGuessed = (val: boolean) => dispatch(gameActions.updateState({ damselGuessed: val }));
  const setShamanKeyword = (val: string | null) => dispatch(gameActions.updateState({ shamanKeyword: val }));
  const setShamanTriggered = (val: boolean) => dispatch(gameActions.updateState({ shamanTriggered: val }));
  const setShamanConvertTarget = (val: number | null) => dispatch(gameActions.updateState({ shamanConvertTarget: val }));
  const setSpyDisguiseMode = (val: 'off' | 'default' | 'on') => dispatch(gameActions.updateState({ spyDisguiseMode: val }));
  const setSpyDisguiseProbability = (val: number) => dispatch(gameActions.updateState({ spyDisguiseProbability: val }));
  const setPukkaPoisonQueue = (val: any[] | ((prev: any[]) => any[])) => {
    const next = typeof val === 'function' ? val(state.pukkaPoisonQueue) : val;
    dispatch(gameActions.updatePukkaQueue(next));
  };
  const setPoChargeState = (val: any) => dispatch(gameActions.updateState({ poChargeState: val }));
  const setAutoRedHerringInfo = (val: string | null) => dispatch(gameActions.updateState({ autoRedHerringInfo: val }));
  const setDayAbilityLogs = (val: any) => dispatch(gameActions.updateState({ dayAbilityLogs: val }));
  const setDamselGuessUsedBy = (val: number[] | ((prev: number[]) => number[])) => {
    const next = typeof val === 'function' ? val(state.damselGuessUsedBy) : val;
    dispatch(gameActions.updateState({ damselGuessUsedBy: next }));
  };
  const setUsedOnceAbilities: React.Dispatch<React.SetStateAction<Record<string, number[]>>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: Record<string, number[]>) => Record<string, number[]>)(state.usedOnceAbilities) : val;
    dispatch(gameActions.updateState({ usedOnceAbilities: next }));
  };
  const setUsedDailyAbilities: React.Dispatch<React.SetStateAction<Record<string, { day: number; seats: number[] }>>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: Record<string, { day: number; seats: number[] }>) => Record<string, { day: number; seats: number[] }>)(state.usedDailyAbilities) : val;
    dispatch(gameActions.updateState({ usedDailyAbilities: next }));
  };
  const setNominationMap: React.Dispatch<React.SetStateAction<Record<number, number>>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: Record<number, number>) => Record<number, number>)(state.nominationMap) : val;
    dispatch(gameActions.updateState({ nominationMap: next }));
  };
  const setBalloonistKnownTypes: React.Dispatch<React.SetStateAction<Record<number, string[]>>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: Record<number, string[]>) => Record<number, string[]>)(state.balloonistKnownTypes) : val;
    dispatch(gameActions.updateState({ balloonistKnownTypes: next }));
  };
  const setBalloonistCompletedIds = (val: number[] | ((prev: number[]) => number[])) => {
    const next = typeof val === 'function' ? val(state.balloonistCompletedIds) : val;
    dispatch(gameActions.updateState({ balloonistCompletedIds: next }));
  };
  const setHadesiaChoices: React.Dispatch<React.SetStateAction<Record<number, 'live' | 'die'>>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: Record<number, 'live' | 'die'>) => Record<number, 'live' | 'die'>)(state.hadesiaChoices) : val;
    dispatch(gameActions.updateState({ hadesiaChoices: next }));
  };
  const setVirginGuideInfo: React.Dispatch<React.SetStateAction<any>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: any) => any)(state.virginGuideInfo) : val;
    dispatch(gameActions.updateState({ virginGuideInfo: next }));
  };
  const setVoteRecords = (val: any[] | ((prev: any[]) => any[])) => {
    const next = typeof val === 'function' ? val(state.voteRecords) : val;
    dispatch(gameActions.updateState({ voteRecords: next }));
  };
  const setVotedThisRound = (val: number[] | ((prev: number[]) => number[])) => {
    const next = typeof val === 'function' ? val(state.votedThisRound) : val;
    dispatch(gameActions.updateState({ votedThisRound: next }));
  };
  const setHasExecutedThisDay: React.Dispatch<React.SetStateAction<boolean>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: boolean) => boolean)(state.hasExecutedThisDay) : val;
    dispatch(gameActions.updateState({ hasExecutedThisDay: next }));
  };
  const setMastermindFinalDay = (val: any) => dispatch(gameActions.updateState({ mastermindFinalDay: val }));
  const setRemainingDays = (val: number | null | ((p: number | null) => number | null)) => {
    const next = typeof val === 'function' ? (val as (p: number | null) => number | null)(state.remainingDays) : val;
    dispatch(gameActions.updateState({ remainingDays: next }));
  };
  const setGoonDrunkedThisNight = (val: boolean | ((p: boolean) => boolean)) => {
    const next = typeof val === 'function' ? (val as (p: boolean) => boolean)(state.goonDrunkedThisNight) : val;
    dispatch(gameActions.updateState({ goonDrunkedThisNight: next }));
  };
  const setHistory = (val: any[]) => dispatch(gameActions.setHistory(val));
  const setNominationRecords: React.Dispatch<React.SetStateAction<{ nominators: Set<number>; nominees: Set<number> }>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: { nominators: Set<number>; nominees: Set<number> }) => { nominators: Set<number>; nominees: Set<number> })(state.nominationRecords) : val;
    dispatch(gameActions.setNominationRecords(next));
  };
  const setLastDuskExecution: React.Dispatch<React.SetStateAction<number | null>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: number | null) => number | null)(state.lastDuskExecution) : val;
    dispatch(gameActions.setDuskExecution(next, state.currentDuskExecution));
  };
  const setCurrentDuskExecution: React.Dispatch<React.SetStateAction<number | null>> = (val) => {
    const next = typeof val === 'function' ? (val as (p: number | null) => number | null)(state.currentDuskExecution) : val;
    dispatch(gameActions.setDuskExecution(state.lastDuskExecution, next));
  };

  // ===========================
  //  MODAL 显示状态 (包装器)
  // ===========================
  const setShowKillConfirmModal = (val: number | null) => dispatch(gameActions.updateState({ showKillConfirmModal: val }));
  const setShowMayorRedirectModal = (val: any) => dispatch(gameActions.updateState({ showMayorRedirectModal: val }));
  const setShowPitHagModal = (val: any) => dispatch(gameActions.updateState({ showPitHagModal: val }));
  const setShowRangerModal = (val: any) => dispatch(gameActions.updateState({ showRangerModal: val }));
  const setShowDamselGuessModal = (val: any) => dispatch(gameActions.updateState({ showDamselGuessModal: val }));
  const setShowShamanConvertModal = (val: boolean) => dispatch(gameActions.updateState({ showShamanConvertModal: val }));
  const setShowHadesiaKillConfirmModal = (val: number[] | null) => dispatch(gameActions.updateState({ showHadesiaKillConfirmModal: val }));
  const setShowPoisonConfirmModal = (val: number | null) => dispatch(gameActions.updateState({ showPoisonConfirmModal: val }));
  const setShowPoisonEvilConfirmModal = (val: number | null) => dispatch(gameActions.updateState({ showPoisonEvilConfirmModal: val }));
  const setShowRestartConfirmModal = (val: boolean) => dispatch(gameActions.updateState({ showRestartConfirmModal: val }));
  const setShowSpyDisguiseModal = (val: boolean) => dispatch(gameActions.updateState({ showSpyDisguiseModal: val }));
  const setShowMayorThreeAliveModal = (val: boolean) => dispatch(gameActions.updateState({ showMayorThreeAliveModal: val }));
  const setShowDrunkModal = (val: number | null) => dispatch(gameActions.updateState({ showDrunkModal: val }));
  const setShowVoteInputModal = (val: number | null) => dispatch(gameActions.updateState({ showVoteInputModal: val }));
  const setShowRoleSelectModal = (val: any) => dispatch(gameActions.updateState({ showRoleSelectModal: val }));
  const setShowMadnessCheckModal = (val: any) => dispatch(gameActions.updateState({ showMadnessCheckModal: val }));
  const setShowDayActionModal = (val: any) => dispatch(gameActions.updateState({ showDayActionModal: val }));
  const setShowDayAbilityModal = (val: any) => dispatch(gameActions.updateState({ showDayAbilityModal: val }));
  const setShowSaintExecutionConfirmModal = (val: any) => dispatch(gameActions.updateState({ showSaintExecutionConfirmModal: val }));
  const setShowLunaticRpsModal = (val: any) => dispatch(gameActions.updateState({ showLunaticRpsModal: val }));
  const setShowVirginTriggerModal = (val: any) => dispatch(gameActions.updateState({ showVirginTriggerModal: val }));
  const setShowRavenkeeperFakeModal = (val: number | null) => dispatch(gameActions.updateState({ showRavenkeeperFakeModal: val }));
  const setShowStorytellerDeathModal = (val: any) => dispatch(gameActions.updateState({ showStorytellerDeathModal: val }));
  const setShowReviewModal = (val: boolean) => dispatch(gameActions.updateState({ showReviewModal: val }));
  const setShowGameRecordsModal = (val: boolean) => dispatch(gameActions.updateState({ showGameRecordsModal: val }));
  const setShowRoleInfoModal = (val: boolean) => dispatch(gameActions.updateState({ showRoleInfoModal: val }));
  const setShowExecutionResultModal = (val: any) => dispatch(gameActions.updateState({ showExecutionResultModal: val }));
  const setShowShootResultModal = (val: any) => dispatch(gameActions.updateState({ showShootResultModal: val }));
  const setShowNightOrderModal = (val: boolean) => dispatch(gameActions.updateState({ showNightOrderModal: val }));
  const setShowFirstNightOrderModal = (val: boolean) => dispatch(gameActions.updateState({ showFirstNightOrderModal: val }));
  const setShowMinionKnowDemonModal = (val: any) => dispatch(gameActions.updateState({ showMinionKnowDemonModal: val }));

  const checkLongPressTimerRef = useRef<NodeJS.Timeout | null>(null); // 核对身份列表长按定时器
  const longPressTriggeredRef = useRef<Set<number>>(new Set()); // 座位长按是否已触发（避免短按被阻断）
  const seatContainerRef = useRef<HTMLDivElement | null>(null); // 椭圆桌容器
  const seatRefs = useRef<Record<number, HTMLDivElement | null>>({}); // 每个座位元素引用

  // 保存每个角色的 hint 信息，用于上一夜时恢复（不重新生成）
  const hintCacheRef = useRef<Map<string, NightHintState>>(new Map());
  // 记录酒鬼是否首次获得信息（首次一定是假的）
  const drunkFirstInfoRef = useRef<Map<number, boolean>>(new Map());

  const seatsRef = useRef(seats);
  const fakeInspectionResultRef = useRef<string | null>(null);
  const consoleContentRef = useRef<HTMLDivElement>(null);
  const currentActionTextRef = useRef<HTMLSpanElement>(null);
  const moonchildChainPendingRef = useRef(false);
  const longPressTimerRef = useRef<Map<number, NodeJS.Timeout>>(new Map()); // 存储每个座位的长按定时器
  const registrationCacheRef = useRef<Map<string, RegistrationResult>>(new Map()); // 同夜查验结果缓存
  const registrationCacheKeyRef = useRef<string>('');
  const introTimeoutRef = useRef<any>(null);

  // 历史记录、提名记录、处决记录已从 state 中解构

  // 使用ref存储最新状态，避免Hook依赖问题
  const gameStateRef = useRef({
    seats,
    gamePhase,
    nightCount,
    executedPlayerId,
    wakeQueueIds,
    currentWakeIndex,
    selectedActionTargets,
    gameLogs,
    selectedScript
  });

  // 返回所有状态和 setter
  return {
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
    showShootModal,
    setShowShootModal,
    showNominateModal,
    setShowNominateModal,
    dayAbilityForm,
    setDayAbilityForm,
    baronSetupCheck,
    setBaronSetupCheck,
    ignoreBaronSetup,
    setIgnoreBaronSetup,
    compositionError,
    setCompositionError,
    showRavenkeeperResultModal,
    setShowRavenkeeperResultModal,
    showAttackBlockedModal,
    setShowAttackBlockedModal,
    showBarberSwapModal,
    setShowBarberSwapModal,
    showNightDeathReportModal,
    setShowNightDeathReportModal,
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
    showKlutzChoiceModal,
    setShowKlutzChoiceModal,
    showSweetheartDrunkModal,
    setShowSweetheartDrunkModal,
    showMoonchildKillModal,
    setShowMoonchildKillModal,
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
    // 所有 Modal 显示状态
    showKillConfirmModal,
    setShowKillConfirmModal,
    showMayorRedirectModal,
    setShowMayorRedirectModal,
    showPitHagModal,
    setShowPitHagModal,
    showRangerModal,
    setShowRangerModal,
    showDamselGuessModal,
    setShowDamselGuessModal,
    showShamanConvertModal,
    setShowShamanConvertModal,
    showHadesiaKillConfirmModal,
    setShowHadesiaKillConfirmModal,
    showPoisonConfirmModal,
    setShowPoisonConfirmModal,
    showPoisonEvilConfirmModal,
    setShowPoisonEvilConfirmModal,
    showRestartConfirmModal,
    setShowRestartConfirmModal,
    showSpyDisguiseModal,
    setShowSpyDisguiseModal,
    showMayorThreeAliveModal,
    setShowMayorThreeAliveModal,
    showDrunkModal,
    setShowDrunkModal,
    showVoteInputModal,
    setShowVoteInputModal,
    showRoleSelectModal,
    setShowRoleSelectModal,
    showMadnessCheckModal,
    setShowMadnessCheckModal,
    showDayActionModal,
    setShowDayActionModal,
    showDayAbilityModal,
    setShowDayAbilityModal,
    showSaintExecutionConfirmModal,
    setShowSaintExecutionConfirmModal,
    showLunaticRpsModal,
    setShowLunaticRpsModal,
    showVirginTriggerModal,
    setShowVirginTriggerModal,
    showRavenkeeperFakeModal,
    setShowRavenkeeperFakeModal,
    showStorytellerDeathModal,
    setShowStorytellerDeathModal,
    showReviewModal,
    setShowReviewModal,
    showGameRecordsModal,
    setShowGameRecordsModal,
    showRoleInfoModal,
    setShowRoleInfoModal,
    showExecutionResultModal,
    setShowExecutionResultModal,
    showShootResultModal,
    setShowShootResultModal,
    showNightOrderModal,
    setShowNightOrderModal,
    showFirstNightOrderModal,
    setShowFirstNightOrderModal,
    showMinionKnowDemonModal,
    setShowMinionKnowDemonModal,
    history,
    setHistory,
    nominationRecords,
    setNominationRecords,
    lastDuskExecution,
    setLastDuskExecution,
    currentDuskExecution,
    setCurrentDuskExecution,

    // useRef
    checkLongPressTimerRef,
    longPressTriggeredRef,
    seatContainerRef,
    seatRefs,
    hintCacheRef,
    drunkFirstInfoRef,
    seatsRef,
    fakeInspectionResultRef,
    consoleContentRef,
    currentActionTextRef,
    moonchildChainPendingRef,
    longPressTimerRef,
    registrationCacheRef,
    registrationCacheKeyRef,
    introTimeoutRef,
    gameStateRef,
  };
}

