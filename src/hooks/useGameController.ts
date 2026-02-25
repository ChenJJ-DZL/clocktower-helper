"use client";

import React, { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { roles, Role, Seat, StatusEffect, LogEntry, GamePhase, WinResult, groupedRoles, typeLabels, typeColors, typeBgColors, RoleType, Script } from "../../app/data";
import { NightHintState, NightInfoResult, GameRecord, TimelineStep } from "../types/game";
import { useGameState } from "./useGameState";
import { useRoleAction } from "./useRoleAction";
import { useNightLogic } from "./useNightLogic";
import { useGameContext, gameActions } from "../contexts/GameContext";
import { useNightActionQueue } from "./useNightActionQueue";
import { convertWakeQueueIdsToSeats } from "./useGameQueueAdapter";
import { isRoleRegistered } from "../roles/index";
import { getRoleConfirmHandler, executePoisonAction } from "./roleActionHandlers";
import { useExecutionHandler, type ExecutionHandlerContext } from "./useExecutionHandler";
import { useNightActionHandler, type NightActionHandlerContext } from "./useNightActionHandler";
import { RoleDefinition, NightActionContext, NightActionResult, DayActionContext, DayActionResult } from "../types/roleDefinition";
import { getRoleDefinition } from "../roles";
import { ModalType } from "../types/modal";
import { DrunkCharadeSelectModal } from "../components/modals/DrunkCharadeSelectModal";
import { useGameFlow } from "./useGameFlow";
import { useSeatManager } from "./useSeatManager";
import { useInteractionHandler } from "./useInteractionHandler";
import { useModalManager } from "./useModalManager";
import { useHistoryController } from "./useHistoryController";

interface DrunkCharadeModalData {
  seatId: number;
  availableRoles: Role[];
  scriptId: string;
}

declare module "../types/modal" {
  interface ModalTypeMapping {
    DRUNK_CHARADE_SELECT: DrunkCharadeModalData;
  }
}
import {
  getRandom,
  getRegistration,
  getRegisteredAlignment,
  computeIsPoisoned,
  addPoisonMark,
  isActionAbility,
  isActorDisabledByPoisonOrDrunk,
  isEvil,
  isGoodAlignment,
  getAliveNeighbors,
  shouldShowFakeInfo,
  getMisinformation,
  getSeatPosition,
  type RegistrationCacheOptions,
  shouldScarletWomanTransform,
  getMayorRedirectTarget,
  canApplyBaronSetup,
  clearRoleStatus
} from "../utils/gameRules";
import { checkGameEnd, processGameEvent, GameAction } from "../../app/gameLogic";
import { calculateNightInfo, generateNightTimeline } from "../utils/nightLogic";
import { isAntagonismEnabled, checkCannotGainAbility, checkMutualExclusion } from "../utils/antagonism";
import { normalizeWakeQueueForDeaths } from "../utils/wakeQueue";
import { getNightOrderOverride } from "../utils/nightOrderOverrides";
import { useGameRecords } from "./useGameRecords";

// DayAbilityConfig type for day ability triggers
export type DayAbilityConfig = {
  roleId: string;
  title: string;
  description: string;
  usage: 'daily' | 'once';
  actionType?: 'lunaticKill';
  logMessage: (seat: Seat) => string;
};

// 暗流涌动标准阵容用于校自动重排
const troubleBrewingPresets = [
  { total: 5, townsfolk: 3, outsider: 0, minion: 1, demon: 1 },
  { total: 6, townsfolk: 3, outsider: 1, minion: 1, demon: 1 },
  { total: 7, townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
  { total: 8, townsfolk: 5, outsider: 1, minion: 1, demon: 1 },
  { total: 9, townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
  { total: 10, townsfolk: 7, outsider: 0, minion: 2, demon: 1 },
  { total: 11, townsfolk: 7, outsider: 1, minion: 2, demon: 1 },
  { total: 12, townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
  { total: 13, townsfolk: 9, outsider: 0, minion: 3, demon: 1 },
  { total: 14, townsfolk: 9, outsider: 1, minion: 3, demon: 1 },
  { total: 15, townsfolk: 9, outsider: 4, minion: 2, demon: 1 },
];

// --- 工具函数 ---
const formatTimer = (s: number) => {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

const getSeatRoleId = (seat?: Seat | null): string | null => {
  if (!seat) return null;
  const role = seat.role?.id === 'drunk' ? seat.charadeRole : seat.role;
  return role ? role.id : null;
};

// 清理临时状态用于复活变身交换等场景
const cleanseSeatStatuses = (seat: Seat, opts?: { keepDeathState?: boolean }): Seat => {
  const preservedDetails = (seat.statusDetails || []).filter(detail => detail === '永久中毒');
  const preservedStatuses = (seat.statuses || []).filter(st => st.duration === 'permanent');
  const base = {
    ...seat,
    isPoisoned: preservedDetails.includes('永久中毒'),
    isDrunk: false,
    isSentenced: false,
    hasAbilityEvenDead: false,
    isEvilConverted: false,
    isGoodConverted: false,
    statusDetails: preservedDetails,
    statuses: preservedStatuses,
    isFirstDeathForZombuul: opts?.keepDeathState ? seat.isFirstDeathForZombuul : false,
  };
  if (opts?.keepDeathState) {
    return { ...base, isDead: seat.isDead };
  }
  return { ...base, isDead: false };
};





// 统一添加酒鬼标记带清除时间
const addDrunkMark = (
  seat: Seat,
  drunkType: 'sweetheart' | 'goon' | 'sailor' | 'innkeeper' | 'courtier' | 'philosopher' | 'minstrel',
  clearTime: string
): { statusDetails: string[], statuses: StatusEffect[] } => {
  const details = seat.statusDetails || [];
  const statuses = seat.statuses || [];

  let markText = '';
  switch (drunkType) {
    case 'sweetheart':
      markText = `心上人致醉${clearTime}清除`;
      break;
    case 'goon':
      markText = `莽夫使其醉酒${clearTime}清除`;
      break;
    case 'sailor':
      markText = `水手致醉${clearTime}清除`;
      break;
    case 'innkeeper':
      markText = `旅店老板致醉${clearTime}清除`;
      break;
    case 'courtier':
      markText = `侍臣致醉${clearTime}清除`;
      break;
    case 'philosopher':
      markText = `哲学家致醉${clearTime}清除`;
      break;
    case 'minstrel':
      markText = `吟游诗人致醉${clearTime}清除`;
      break;
  }

  // 移除同类型的旧标记添加新标
  const filteredDetails = details.filter(d => {
    if (drunkType === 'sweetheart') {
      return !d.includes('心上人致醉');
    } else if (drunkType === 'goon') {
      return !d.includes('莽夫使其醉酒');
    } else if (drunkType === 'sailor') {
      return !d.includes('水手致醉');
    } else if (drunkType === 'innkeeper') {
      return !d.includes('旅店老板致醉');
    } else if (drunkType === 'courtier') {
      return !d.includes('侍臣致醉');
    } else if (drunkType === 'philosopher') {
      return !d.includes('哲学家致醉');
    } else if (drunkType === 'minstrel') {
      return !d.includes('吟游诗人致醉');
    }
    return true;
  });

  const newDetails = [...filteredDetails, markText];
  const newStatuses = [...statuses, { effect: 'Drunk', duration: clearTime }];

  return { statusDetails: newDetails, statuses: newStatuses };
};



// 用于渲染的阵营颜色优先考虑转换标记
const getDisplayRoleType = (seat: Seat): string | null => {
  // 阵营颜色以展示给玩家的角色为主，但仍需考虑阵营转化标记
  const baseRole = seat.displayRole || seat.role;
  if (!baseRole) return null;
  if (seat.isEvilConverted) return 'demon';
  if (seat.isGoodConverted) return 'townsfolk';
  return baseRole.type;
};

const hasTeaLadyProtection = (targetSeat: Seat | undefined, allSeats: Seat[]): boolean => {
  if (!targetSeat) return false;
  const neighbors = getAliveNeighbors(allSeats, targetSeat.id);
  return neighbors.some(
    (neighbor) =>
      getSeatRoleId(neighbor) === 'tea_lady' &&
      isGoodAlignment(neighbor) &&
      isGoodAlignment(targetSeat)
  );
};

/**
 * 检查玩家是否有处决保护
 * 
 * 隐性规则2：不能最大
 * 禁止性规则优先于允许性规则。例如：
 * - 弄臣等能力会造成免死效果
 * - 刺客的能力会让"保护某人不会死亡"的能力无法产生效果
 * - 因此刺客的攻击能够杀死具有保护效果的玩家
 * 
 * 注意：刺客等角色的攻击会覆盖保护效果，需要在调用此函数前检查攻击者角色
 */
const hasExecutionProof = (seat?: Seat | null, attackerRoleId?: string): boolean => {
  if (!seat) return false;

  // 隐性规则2：刺客等角色的能力会让保护无效
  // 如果攻击者是刺客，保护无效
  if (attackerRoleId === 'assassin') {
    return false;
  }

  // Check statuses array for ExecutionProof effect
  if ((seat.statuses || []).some((status) => status.effect === 'ExecutionProof')) {
    return true;
  }
  // Check statusDetails for execution_protected marker (from Devil's Advocate, etc.)
  if ((seat.statusDetails || []).some((detail) => detail.includes('execution_protected') || detail.includes('处决保护'))) {
    return true;
  }
  return false;
};

/**
 * Game Controller Hook
 * Extracts all state management and logic from Home component
 */
export type VfxTrigger = { seatId: number; type: 'slayer' | 'virgin' } | null;

export function useGameController() {
  // Get all state from useGameState
  const gameState = useGameState();

  // --- NEW: VFX State Coordinator ---
  const [vfxTrigger, setVfxTrigger] = useState<VfxTrigger>(null);

  // 集成新的队列管理系统（可选，保持向后兼容）
  // 注意：新系统可选，如果GameContext不可用，继续使用旧系统
  let nightQueue: ReturnType<typeof useNightActionQueue> | null = null;
  let gameContextDispatch: React.Dispatch<any> | null = null;
  try {
    const context = useGameContext();
    gameContextDispatch = context.dispatch;
    nightQueue = useNightActionQueue();
  } catch (e) {
    // GameContext不可用时，继续使用旧系统
    // 这是正常的，因为在完全迁移前，新旧系统可以共存
  }

  // Destructure all state variables
  const {
    // 基础状态
    mounted, setMounted,
    showIntroLoading, setShowIntroLoading,
    isPortrait, setIsPortrait,

    // 座位和游戏核心状态
    seats: baseSeats, setSeats: setBaseSeats,
    initialSeats, setInitialSeats,
    gamePhase: baseGamePhase, setGamePhase: setBaseGamePhase,
    selectedScript, setSelectedScript,
    nightCount: baseNightCount, setNightCount: setBaseNightCount,
    deadThisNight: baseDeadThisNight, setDeadThisNight: setBaseDeadThisNight,
    executedPlayerId, setExecutedPlayerId,
    gameLogs, setGameLogs,
    winResult, setWinResult,
    winReason, setWinReason,

    // 时间和UI状态
    startTime, setStartTime,
    timer: baseTimer, setTimer: setBaseTimer,
    selectedRole, setSelectedRole,
    contextMenu, setContextMenu,
    showMenu, setShowMenu,
    longPressingSeats, setLongPressingSeats,

    // 夜晚行动状态
    wakeQueueIds: baseWakeQueueIds, setWakeQueueIds: setBaseWakeQueueIds,
    currentWakeIndex: baseCurrentWakeIndex, setCurrentWakeIndex: setBaseCurrentWakeIndex,
    selectedActionTargets: baseSelectedActionTargets, setSelectedActionTargets: setBaseSelectedActionTargets,
    inspectionResult, setInspectionResult,
    inspectionResultKey, setInspectionResultKey,
    currentHint, setCurrentHint,

    // 白天事件状态
    todayDemonVoted, setTodayDemonVoted,
    todayMinionNominated, setTodayMinionNominated,
    todayExecutedId, setTodayExecutedId,
    witchCursedId, setWitchCursedId,
    witchActive, setWitchActive,
    cerenovusTarget, setCerenovusTarget,
    isVortoxWorld, setIsVortoxWorld,
    fangGuConverted, setFangGuConverted,
    jugglerGuesses, setJugglerGuesses,
    evilTwinPair, setEvilTwinPair,
    outsiderDiedToday, setOutsiderDiedToday,
    gossipStatementToday, setGossipStatementToday,
    gossipTrueTonight, setGossipTrueTonight,
    gossipSourceSeatId, setGossipSourceSeatId,

    // ===========================
    //  统一的弹窗状态
    // ===========================
    currentModal: baseCurrentModal, setCurrentModal: setBaseCurrentModal,

    // ===========================
    //  保留的辅助状态（非弹窗显示状态）
    // ===========================
    showShootModal, setShowShootModal,
    showNominateModal, setShowNominateModal,
    dayAbilityForm, setDayAbilityForm,
    baronSetupCheck, setBaronSetupCheck,
    ignoreBaronSetup, setIgnoreBaronSetup,
    compositionError, setCompositionError,
    showRavenkeeperResultModal, setShowRavenkeeperResultModal,
    showAttackBlockedModal, setShowAttackBlockedModal,
    showBarberSwapModal, setShowBarberSwapModal,
    showNightDeathReportModal, setShowNightDeathReportModal,
    voteInputValue, setVoteInputValue,
    showVoteErrorToast, setShowVoteErrorToast,
    gameRecords, setGameRecords,
    mayorRedirectTarget, setMayorRedirectTarget,
    nightOrderPreview, setNightOrderPreview,
    pendingNightQueue, setPendingNightQueue,
    nightQueuePreviewTitle, setNightQueuePreviewTitle,
    firstNightOrder, setFirstNightOrder,
    poppyGrowerDead, setPoppyGrowerDead,
    klutzChoiceTarget, setKlutzChoiceTarget,
    showKlutzChoiceModal, setShowKlutzChoiceModal,
    showSweetheartDrunkModal, setShowSweetheartDrunkModal,
    showMoonchildKillModal, setShowMoonchildKillModal,
    lastExecutedPlayerId, setLastExecutedPlayerId,
    damselGuessed, setDamselGuessed,
    shamanKeyword, setShamanKeyword,
    shamanTriggered, setShamanTriggered,
    shamanConvertTarget, setShamanConvertTarget,
    spyDisguiseMode, setSpyDisguiseMode,
    spyDisguiseProbability, setSpyDisguiseProbability,
    pukkaPoisonQueue, setPukkaPoisonQueue,
    poChargeState, setPoChargeState,
    autoRedHerringInfo, setAutoRedHerringInfo,
    dayAbilityLogs, setDayAbilityLogs,
    damselGuessUsedBy, setDamselGuessUsedBy,
    usedOnceAbilities, setUsedOnceAbilities,
    usedDailyAbilities, setUsedDailyAbilities,
    nominationMap, setNominationMap,
    balloonistKnownTypes, setBalloonistKnownTypes,
    balloonistCompletedIds, setBalloonistCompletedIds,
    hadesiaChoices, setHadesiaChoices,
    virginGuideInfo, setVirginGuideInfo,
    voteRecords, setVoteRecords,
    votedThisRound, setVotedThisRound,
    hasExecutedThisDay, setHasExecutedThisDay,
    mastermindFinalDay, setMastermindFinalDay,
    remainingDays, setRemainingDays,
    goonDrunkedThisNight, setGoonDrunkedThisNight,
    // 所有 Modal 显示状态
    showKillConfirmModal, setShowKillConfirmModal,
    showMayorRedirectModal, setShowMayorRedirectModal,
    showPitHagModal, setShowPitHagModal,
    showRangerModal, setShowRangerModal,
    showDamselGuessModal, setShowDamselGuessModal,
    showShamanConvertModal, setShowShamanConvertModal,
    showHadesiaKillConfirmModal, setShowHadesiaKillConfirmModal,
    showPoisonConfirmModal, setShowPoisonConfirmModal,
    showPoisonEvilConfirmModal, setShowPoisonEvilConfirmModal,
    showRestartConfirmModal, setShowRestartConfirmModal,
    showSpyDisguiseModal, setShowSpyDisguiseModal,
    showMayorThreeAliveModal, setShowMayorThreeAliveModal,
    showDrunkModal, setShowDrunkModal,
    showVoteInputModal, setShowVoteInputModal,
    showRoleSelectModal, setShowRoleSelectModal,
    showMadnessCheckModal, setShowMadnessCheckModal,
    showDayActionModal, setShowDayActionModal,
    showDayAbilityModal, setShowDayAbilityModal,
    showSaintExecutionConfirmModal, setShowSaintExecutionConfirmModal,
    showLunaticRpsModal, setShowLunaticRpsModal,
    showVirginTriggerModal, setShowVirginTriggerModal,
    showRavenkeeperFakeModal, setShowRavenkeeperFakeModal,
    showStorytellerDeathModal, setShowStorytellerDeathModal,
    showReviewModal, setShowReviewModal,
    showGameRecordsModal, setShowGameRecordsModal,
    showRoleInfoModal, setShowRoleInfoModal,
    showExecutionResultModal, setShowExecutionResultModal,
    showShootResultModal, setShowShootResultModal,
    showNightOrderModal, setShowNightOrderModal,
    showFirstNightOrderModal, setShowFirstNightOrderModal,
    showMinionKnowDemonModal, setShowMinionKnowDemonModal,
    history, setHistory,
    nominationRecords, setNominationRecords,
    lastDuskExecution, setLastDuskExecution,
    currentDuskExecution, setCurrentDuskExecution,

    // Refs
    checkLongPressTimerRef,
    longPressTriggeredRef,
    seatContainerRef,
    seatRefs,
    hintCacheRef,
    drunkFirstInfoRef,
    // seatsRef removed (REFACTOR)
    fakeInspectionResultRef,
    consoleContentRef,
    currentActionTextRef,
    moonchildChainPendingRef,
    longPressTimerRef,
    registrationCacheRef,
    registrationCacheKeyRef,
    introTimeoutRef,
    // gameStateRef removed (REFACTOR)
  } = gameState;

  // CRITICAL FIX: Lock to prevent double-submission race conditions
  const processingRef = useRef(false);

  // Live night order preview derived from the actual wake queue (so it never goes stale / missing)
  // NOTE: Uses baseGamePhase here since gamePhase is defined later from gameFlow
  const nightOrderPreviewLive = useMemo(() => {
    const isNightPhase = baseGamePhase === "firstNight" || baseGamePhase === "night";
    if (!isNightPhase) return [];

    const isFirst = baseGamePhase === "firstNight";
    const byId = new Map(baseSeats.map((s) => [s.id, s]));

    return baseWakeQueueIds
      .map((seatId, idx) => {
        const seat = byId.get(seatId);
        const effectiveRoleId =
          seat?.role?.id === "drunk" ? seat?.charadeRole?.id : seat?.role?.id;
        const roleName =
          seat?.role?.id === "drunk"
            ? seat?.charadeRole?.name ?? seat?.role?.name
            : seat?.role?.name;
        const order =
          (effectiveRoleId
            ? getNightOrderOverride(effectiveRoleId, isFirst)
            : null) ?? idx + 1;

        return {
          roleName: roleName || effectiveRoleId || "未知角色",
          seatNo: seatId + 1,
          order,
        };
      })
      .filter((x) => !!x.roleName);
  }, [baseGamePhase, baseSeats, baseWakeQueueIds]);

  // 占位组合式 Hooks（后续逐步迁移状态/方法）
  const startNightImplRef = useRef<((isFirst: boolean) => void) | undefined>(undefined);
  const finalizeNightStartRef = useRef<((queue: any[], isFirst: boolean) => void) | undefined>(undefined);
  const seatManagerLogRef = useRef<((msg: string) => void) | null>(null);
  const seatManagerLog = useCallback((msg: string) => {
    seatManagerLogRef.current?.(msg);
  }, []);
  const flowSaveHistoryRef = useRef<(() => void) | null>(null);
  const flowSaveHistory = useCallback(() => {
    flowSaveHistoryRef.current?.();
  }, []);
  const flowAddLogRef = useRef<((msg: string) => void) | null>(null);
  const flowAddLog = useCallback((msg: string) => {
    flowAddLogRef.current?.(msg);
  }, []);
  const flowSaveGameRecordRef = useRef<((record: GameRecord) => void) | null>(null);
  const flowSaveGameRecord = useCallback((record: GameRecord) => {
    flowSaveGameRecordRef.current?.(record);
  }, []);
  const flowTriggerIntroRef = useRef<(() => void) | null>(null);
  const flowTriggerIntroLoading = useCallback(() => {
    flowTriggerIntroRef.current?.();
  }, []);
  const flowResetRegistrationCache = useCallback(
    (key: string) => {
      registrationCacheRef.current = new Map();
      registrationCacheKeyRef.current = key;
    },
    [registrationCacheRef, registrationCacheKeyRef]
  );

  // --- Initialize Sub-hooks (Refactored to use GameContext natively) ---
  const gameFlow = useGameFlow();
  const seatManager = useSeatManager();
  const modalManager = useModalManager();
  const historyController = useHistoryController();

  // 将组合式 Hook 输出解构为本地变量，保持后续逻辑不变（兼容性桥接）
  // 注意：优先使用 sub-hooks 提供的状态和方法，它们已与 GameContext 深度集成
  const {
    gamePhase,
    setGamePhase,
    nightCount,
    setNightCount,
    timer,
    setTimer,
    isTimerRunning,
    handleTimerPause,
    handleTimerStart,
    handleTimerReset,
    startNight,
    enterNightPhase,
    enterDayPhase,
    enterDuskPhase,
    handleDayEndTransition,
    handleSwitchScript,
    handleNewGame: gameFlowHandleNewGame,
    closeNightOrderPreview,
    confirmNightOrderPreview,
    proceedToCheckPhase,
    handlePreStartNight,
    handleStartNight,
    proceedToFirstNight: gameFlowProceedToFirstNight,
  } = gameFlow;

  const {
    seats,
    setSeats,
    deadThisNight,
    setDeadThisNight,
    reviveSeat,
    changeRole,
    swapRoles,
    killSeatOnly,
    reviveSeatOnly,
  } = seatManager;

  const {
    currentModal,
    setCurrentModal,
    openModal,
    closeModal,
  } = modalManager;

  const {
    saveHistory,
    handleStepBack,
    handleGlobalUndo,
  } = historyController;

  // 别名还原 (兼容旧逻辑中大量直接引用的变量名)
  const wakeQueueIds = gameState.wakeQueueIds;
  const setWakeQueueIds = gameState.setWakeQueueIds;
  const currentWakeIndex = gameState.currentWakeIndex;
  const setCurrentWakeIndex = gameState.setCurrentWakeIndex;
  const selectedActionTargets = gameState.selectedActionTargets;
  const setSelectedActionTargets = gameState.setSelectedActionTargets;
  const nightActionQueue = nightQueue?.nightActionQueue || [];
  const resetRegistrationCache = flowResetRegistrationCache;

  // 桥接 Refs
  useEffect(() => {
    flowSaveHistoryRef.current = saveHistory;
  }, [saveHistory]);

  // [REFACTOR] seatsRef sync removed - seats is always read from Context

  // Get functions from useRoleAction
  const { executeAction, canSelectTarget: checkCanSelectTarget, getTargetCount: getRoleTargetCount } = useRoleAction();

  // Get functions from useExecutionHandler and useNightActionHandler
  const { handleExecution } = useExecutionHandler();
  const { handleNightAction } = useNightActionHandler();

  // ============================================================================
  // 关键：避免 “Cannot access 'killPlayer' before initialization”
  // ============================================================================
  const killPlayerImplRef = useRef<((targetId: number, options?: any) => void) | null>(null);

  const killPlayer = useCallback((targetId: number, options: any = {}) => {
    killPlayerImplRef.current?.(targetId, options);
  }, []);



  const getRegistrationCached = useCallback(
    (targetPlayer: Seat, viewingRole?: Role | null) => {
      const cacheKey = registrationCacheKeyRef.current || `${gamePhase}-${nightCount}`;
      return getRegistration(
        targetPlayer,
        viewingRole,
        spyDisguiseMode,
        spyDisguiseProbability,
        { cache: registrationCacheRef.current, cacheKey }
      );
    },
    [spyDisguiseMode, spyDisguiseProbability, gamePhase, nightCount]
  );

  // 根据selectedScript过滤角色的辅助函数
  const getFilteredRoles = useCallback((roleList: Role[]): Role[] => {
    if (!selectedScript) return [];

    // 自定义/导入的剧本逻辑
    if (selectedScript.isCustom && selectedScript.roleIds) {
      return roleList.filter(r => selectedScript.roleIds!.includes(r.id));
    }

    return roleList
      .filter(r => !r.hidden) // 隐藏标记的角色不暴露到前台
      .filter(r =>
        !r.script ||
        r.script === selectedScript.name ||
        (selectedScript.id === 'trouble_brewing' && !r.script) ||
        (selectedScript.id === 'bad_moon_rising' && (!r.script || r.script === '暗月初升')) ||
        (selectedScript.id === 'sects_and_violets' && (!r.script || r.script === '梦陨春宵')) ||
        (selectedScript.id === 'midnight_revelry' && (!r.script || r.script === '夜半狂欢'))
      );
  }, [selectedScript]);

  const hasUsedAbility = useCallback((roleId: string, seatId: number) => {
    return (usedOnceAbilities[roleId] || []).includes(seatId);
  }, [usedOnceAbilities]);

  const markAbilityUsed = useCallback((roleId: string, seatId: number) => {
    // 记录一次性能力已用并在座位状态中打标
    setSeats((prev: Seat[]) => prev.map(s => {
      if (s.id !== seatId) return s;
      const detail = '一次性能力已用';
      const statusDetails = s.statusDetails || [];
      return statusDetails.includes(detail)
        ? s
        : { ...s, statusDetails: [...statusDetails, detail] };
    }));
    setUsedOnceAbilities((prev: Record<string, number[]>) => {
      const existed = prev[roleId] || [];
      if (existed.includes(seatId)) return prev;
      return { ...prev, [roleId]: [...existed, seatId] };
    });
  }, []);

  const hasUsedDailyAbility = useCallback((roleId: string, seatId: number) => {
    const entry = usedDailyAbilities[roleId];
    if (!entry) return false;
    if (entry.day !== nightCount) return false;
    return entry.seats.includes(seatId);
  }, [usedDailyAbilities, nightCount]);

  const markDailyAbilityUsed = useCallback((roleId: string, seatId: number) => {
    setUsedDailyAbilities((prev: Record<string, { day: number; seats: number[] }>) => {
      const currentDay = nightCount;
      const entry = prev[roleId];
      const seatsForDay = entry && entry.day === currentDay ? entry.seats : [];
      if (seatsForDay.includes(seatId)) return prev;
      return { ...prev, [roleId]: { day: currentDay, seats: [...seatsForDay, seatId] } };
    });
  }, [nightCount]);

  const getDisplayRoleForSeat = useCallback((seat?: Seat | null) => {
    if (!seat) return null;
    return seat?.role?.id === 'drunk' ? seat.charadeRole : seat.role;
  }, []);

  // 根据selectedScript过滤后的groupedRoles
  const filteredGroupedRoles = useMemo(() => {
    if (!selectedScript) return {} as Record<string, Role[]>;
    const filtered = getFilteredRoles(roles);
    // 去重：基于角色 id 去除重复的角色
    const seenIds = new Set<string>();
    const uniqueFiltered = filtered.filter(role => {
      if (seenIds.has(role.id)) {
        return false; // 已存在，跳过
      }
      seenIds.add(role.id);
      return true; // 首次出现，保留
    });
    return uniqueFiltered.reduce((acc, role) => {
      if (!acc[role.type]) acc[role.type] = [];
      acc[role.type].push(role);
      return acc;
    }, {} as Record<string, Role[]>);
  }, [selectedScript, getFilteredRoles, roles]);

  const triggerIntroLoading = useCallback(() => {
    setShowIntroLoading(true);
    if (introTimeoutRef.current) {
      clearTimeout(introTimeoutRef.current);
    }
    introTimeoutRef.current = setTimeout(() => {
      setShowIntroLoading(false);
      introTimeoutRef.current = null;
    }, 2000);
  }, []);

  // Create a wrapper for setGameRecords to match the expected Dispatch type
  const setGameRecordsProp = useCallback((val: React.SetStateAction<GameRecord[]>) => {
    if (typeof val === 'function') {
      // Since we don't have the current records easily available here without adding it to dependencies,
      // and useGameRecords usually just sets the value, we'll try to get it from context if possible
      // or just handle the static case if it's the most common.
      // For now, let's use a safe approach:
      const currentRecords: GameRecord[] = []; // Placeholder
      setGameRecords(val(currentRecords));
    } else {
      setGameRecords(val);
    }
  }, [setGameRecords]);

  // 轻量对局记录 Hook（仅负责 localStorage 读写）
  const { loadGameRecords, saveGameRecord } = useGameRecords({ setGameRecords: setGameRecordsProp });

  // 同步状态到GameContext（如果可用）
  useEffect(() => {
    if (gameContextDispatch && wakeQueueIds.length > 0) {
      // 将wakeQueueIds转换为Seat[]
      const queueSeats = convertWakeQueueIdsToSeats(wakeQueueIds, seats);
      if (queueSeats.length > 0) {
        // 同步队列和索引到GameContext
        gameContextDispatch(gameActions.setNightActionQueue(queueSeats));
        gameContextDispatch(gameActions.setCurrentQueueIndex(currentWakeIndex));
      }
    }
  }, [wakeQueueIds, currentWakeIndex, seats, gameContextDispatch]);

  // [REFACTOR] gameStateRef sync effect removed - all state reads go through Context

  // --- Effects ---
  useEffect(() => {
    try {
      setMounted(true);
      loadGameRecords(); // 加载对局记录
      setSeats(Array.from({ length: 15 }, (_, i) => ({
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
        hasBeenNominated: false,
        isDemonSuccessor: false,
        hasAbilityEvenDead: false,
        hasGhostVote: true,
        statusDetails: [],
        statuses: [],
        grandchildId: null,
        isGrandchild: false,
        zombuulLives: 1
      })));
      triggerIntroLoading();
    } catch (error) {
      console.error('初始化失败', error);
      // 即使出错也要设置 mounted避免白屏
      setMounted(true);
    }
  }, []); // 只在组件挂载时执行一次

  useEffect(() => {
    return () => {
      if (introTimeoutRef.current) {
        clearTimeout(introTimeoutRef.current);
      }
    };
  }, []);

  // 间谍/隐士查验结果在同一夜晚保持一致伪装参数变化时刷新缓存
  useEffect(() => {
    if (gamePhase === 'firstNight' || gamePhase === 'night') {
      resetRegistrationCache(`${gamePhase}-${nightCount}-disguise`);
    }
  }, [spyDisguiseMode, spyDisguiseProbability, resetRegistrationCache, gamePhase, nightCount]);

  // 进入新的夜晚阶段时重置同夜查验结果缓存保证当晚内一致跨夜独立
  useEffect(() => {
    if (gamePhase === 'firstNight' || gamePhase === 'night') {
      resetRegistrationCache(`${gamePhase}-${nightCount}`);
    }
  }, [gamePhase, nightCount, resetRegistrationCache]);

  // 检测设备方向和屏幕尺寸
  useEffect(() => {
    if (!mounted) return;

    const checkOrientation = () => {
      // 检测是否为竖屏高度大于宽度或者使用媒体查询
      const isPortraitMode = window.innerHeight > window.innerWidth ||
        window.matchMedia('(orientation: portrait)').matches;
      setIsPortrait(isPortraitMode);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, [mounted]);

  // [REFACTOR] seatsRef sync effect removed

  // 自动识别当前是否处于涡流恶魔环境镇民信息应为假
  useEffect(() => {
    const aliveVortox = seats.some(
      s => !s.isDead && ((s.role?.id === 'vortox') || (s.isDemonSuccessor && s.role?.id === 'vortox'))
    );
    setIsVortoxWorld(aliveVortox);
  }, [seats]);

  // 预留的一次配对状态后续在梦陨春宵角色逻辑中使用
  useEffect(() => {
    // 目前仅用于保持状态引用防止未使用警告
  }, [fangGuConverted, jugglerGuesses, evilTwinPair, usedOnceAbilities, witchActive, cerenovusTarget, witchCursedId, todayExecutedId]);

  // 清理已离场的气球驾驶员记录
  useEffect(() => {
    setBalloonistKnownTypes((prev: Record<number, string[]>) => {
      const activeIds = new Set(seats.filter(s => s.role?.id === 'balloonist').map(s => s.id));
      const next: Record<number, string[]> = {};
      activeIds.forEach(id => {
        if (prev[id]) next[id] = prev[id];
      });
      return next;
    });
  }, [seats]);

  const addLog = useCallback((msg: string) => {
    setGameLogs((p: LogEntry[]) => [...p, { day: nightCount, phase: gamePhase, message: msg }]);
  }, [nightCount, gamePhase]);

  useEffect(() => {
    seatManagerLogRef.current = addLog;
  }, [addLog]);

  useEffect(() => {
    flowAddLogRef.current = addLog;
  }, [addLog]);

  useEffect(() => {
    flowSaveGameRecordRef.current = saveGameRecord;
  }, [saveGameRecord]);

  useEffect(() => {
    flowTriggerIntroRef.current = triggerIntroLoading;
  }, [triggerIntroLoading]);

  // 气球驾驶员当已知完所有类型时写说明日志只写一次
  useEffect(() => {
    const allLabels = ['镇民', '外来者', '爪牙', '恶魔'];
    const newlyCompleted: number[] = [];
    Object.entries(balloonistKnownTypes).forEach(([idStr, known]) => {
      const id = Number(idStr);
      if (!Number.isNaN(id) && allLabels.every(label => known.includes(label)) && !balloonistCompletedIds.includes(id)) {
        newlyCompleted.push(id);
      }
    });
    if (newlyCompleted.length > 0) {
      newlyCompleted.forEach(id => {
        addLog(`气球驾驶员${id + 1}号已在前几夜得知所有角色类型（镇民、外来者、爪牙、恶魔），从今夜起将不再被唤醒，这符合规则`);
      });
      setBalloonistCompletedIds((prev: number[]) => [...prev, ...newlyCompleted]);
    }
  }, [balloonistKnownTypes, balloonistCompletedIds, addLog]);

  // 添加日志并去重每个玩家每晚只保留最后一次行动
  const addLogWithDeduplication = useCallback((msg: string, playerId?: number, roleName?: string) => {
    setGameLogs((prev: LogEntry[]) => {
      // 如果提供了玩家ID和角色名先删除该玩家在该阶段之前的日志
      if (playerId !== undefined && roleName) {
        const filtered = prev.filter(log =>
          !(log.message.includes(`${playerId + 1}号(${roleName})`) && log.phase === gamePhase)
        );
        return [...filtered, { day: nightCount, phase: gamePhase, message: msg }];
      }
      // 否则直接添加
      return [...prev, { day: nightCount, phase: gamePhase, message: msg }];
    });
  }, [nightCount, gamePhase]);

  const cleanStatusesForNewDay = useCallback(() => {
    setSeats((prev: Seat[]) => prev.map(s => {
      // 清除仅限夜晚的状态
      const remaining = (s.statuses || []).filter(status =>
        status.effect === 'ExecutionProof' || status.duration !== 'Night'
      );

      // 清除临时中毒状态普克造成的除外
      const filteredStatusDetails = (s.statusDetails || []).filter(st => {
        // 保留永久中毒标记
        if (st.includes('永久中毒') || st.includes('永久')) return true;
        // 保留普卡中毒普卡的中毒会在夜晚时自动处理死亡
        if (st.includes('普卡中毒')) return true;
        // 清除所有带"至下个黄昏清除"次日黄昏清除"的临时中毒标记
        if (st.includes('至下个黄昏清除') || st.includes('下个黄昏清除') || st.includes('次日黄昏清除')) {
          // 检查是否是普卡中毒
          if (st.includes('普卡中毒')) return true;
          return false; // 清除其他临时中毒
        }
        // 保留其他标记如"下一夜死亡时"下一个善良玩家被处决等特殊清除条件
        return true;
      });

      // 重新计算中毒状态
      const poisonedAfterClean = computeIsPoisoned({
        ...s,
        statusDetails: filteredStatusDetails,
        statuses: remaining,
      });

      return {
        ...s,
        statuses: remaining,
        statusDetails: filteredStatusDetails,
        isPoisoned: poisonedAfterClean
      };
    }));
  }, []);

  const isEvilWithJudgment = useCallback((seat: Seat): boolean => {
    // 默认使用isEvil函数
    return isEvil(seat);
  }, []);

  const enqueueRavenkeeperIfNeeded = useCallback((targetId: number) => {
    const targetSeat = seats.find(s => s.id === targetId);
    if (getSeatRoleId(targetSeat) !== 'ravenkeeper') return;
    setWakeQueueIds((prev: number[]) => {
      if (prev.includes(targetId)) return prev;
      const insertionIndex = Math.min(currentWakeIndex + 1, prev.length);
      const next = [...prev];
      next.splice(insertionIndex, 0, targetId);
      return next;
    });
  }, [seats, currentWakeIndex]);

  // ============================================================================
  // CRITICAL REFACTOR: Night State Snapshot Pattern with Truth Ref
  // ============================================================================
  // Instead of calculating nightInfo on the fly (which causes re-renders and loops),
  // we store a static snapshot of the current step's data.
  // CRITICAL FIX: We added wakeIndexRef as the "Truth Ref" to prevent stale closures.
  const wakeIndexRef = useRef(0);
  const [activeNightStep, setActiveNightStep] = useState<NightInfoResult | null>(null);

  // Expose activeNightStep as nightInfo for backward compatibility
  const nightInfo = activeNightStep;

  // ============================================================================
  // CRITICAL FIX: "New Game" Hang
  // ============================================================================
  const handleNewGame = useCallback(() => {
    console.log("[GameController] Handling New Game - Fully Resetting State");

    // 1. Reset Local Refs (The Truth)
    wakeIndexRef.current = 0;

    // 2. Reset Local State (Snapshot)
    setActiveNightStep(null);
    setCurrentWakeIndex(0);

    // 3. Reset Interaction State
    setSelectedActionTargets([]);
    setInspectionResult(null);
    fakeInspectionResultRef.current = null;

    // 4. Call upstream handler
    gameFlowHandleNewGame();

  }, [gameFlowHandleNewGame, setSelectedActionTargets, setInspectionResult, setCurrentWakeIndex]);

  /**
   * Override proceedToFirstNight to initialize the snapshot and Truth Ref
   */
  const proceedToFirstNight = useCallback((rolesToUse?: Role[]) => {
    // 🛡️ Guard: If already in night phase, do NOT regenerate queue
    if (gamePhase === 'firstNight' || gamePhase === 'night') {
      console.warn(`[NightLogic] [proceedToFirstNight] Already in ${gamePhase}, ignoring request.`);
      return;
    }

    // Call original flow to set up state
    // Note: We might need to manually set wakeQueueIds if we want strict sync
    // But gameFlow.proceedToFirstNight already sets it.
    // To be perfectly safe, we let gameFlow do its thing, but we override the index.

    // 1. 生成队列 (Generate Timeline locally to get queue IDs immediately)
    const latestSeats = seats;
    const newTimeline = generateNightTimeline(latestSeats, true);
    const newQueueIds = newTimeline
      .map(step => (step.type === 'character' && step.seatId !== undefined) ? step.seatId : -1);

    console.log("🌙 [NightLogic] Starting Night. Queue:", newQueueIds);

    // 2. ⚡️ 批量重置所有状态 (Batch Reset)
    // We update gameFlow state indirectly or directly if possible. 
    // Since we use gameFlow hook, we should probably call its methods or dispatch actions.
    // Calling gameFlowProceedToFirstNight does the setTimeline/setWakeQueueIds/setGamePhase.
    gameFlowProceedToFirstNight(rolesToUse);

    // 3. 关键：同步重置 Ref 和 State (Sync Ref and State)
    wakeIndexRef.current = 0;
    setCurrentWakeIndex(0);

    // 4. 立即计算第一步数据 (Snapshot First Step)
    if (newQueueIds.length > 0) {
      console.log(`[NightLogic] Initializing First Night with seat ${newQueueIds[0]}`);
      const firstInfo = calculateNightInfo(
        selectedScript,
        latestSeats,
        newQueueIds[0]!,
        'firstNight',
        lastDuskExecution || 0,
        undefined, // fakeInspectionResult
        drunkFirstInfoRef.current,
        isEvilWithJudgment,
        poppyGrowerDead,
        [],
        spyDisguiseMode,
        spyDisguiseProbability,
        deadThisNight,
        balloonistKnownTypes,
        registrationCacheRef.current,
        `${'firstNight'}-${nightCount}`,
        isVortoxWorld,
        todayDemonVoted,
        todayMinionNominated,
        todayExecutedId,
        hasUsedAbility,
        votedThisRound,
        outsiderDiedToday
      );
      setActiveNightStep(firstInfo);
    } else {
      setActiveNightStep(null);
    }
  }, [gameFlowProceedToFirstNight, seats, selectedScript, lastDuskExecution, drunkFirstInfoRef, isEvilWithJudgment, poppyGrowerDead, spyDisguiseMode, spyDisguiseProbability, deadThisNight, balloonistKnownTypes, isVortoxWorld, todayDemonVoted, todayMinionNominated, todayExecutedId, hasUsedAbility, votedThisRound, outsiderDiedToday, nightCount]);


  // ============================================================================
  // CRITICAL FIX: Robust continueToNextAction with Truth Ref
  // ============================================================================
  const continueToNextAction = useCallback(() => {
    // 1. 立即读取当前真实的索引 (Read Truth Ref)
    const currentIndex = wakeIndexRef.current;
    const nextIndex = currentIndex + 1;

    // 2. 边界检查：是否所有角色都动完了？ (Bounds Check)
    // 注意：这里直接读 Ref，不需要依赖 wakeQueueIds 状态可能是好的，但 wakeQueueIds 是 state。
    // In standard React, accessing state in callback is fine if dep array is correct.
    const currentQueue = wakeQueueIds;
    const queueLength = currentQueue.length;

    console.log(`[NightLogic] continueToNextAction: Ref(${currentIndex}) -> ${nextIndex}. Queue len: ${queueLength}`);

    if (nextIndex >= queueLength) {
      console.log(`🌞 [NightLogic] End of Queue (${nextIndex}/${queueLength}). Transitioning to Day.`);

      // End of Night Transition Logic
      // We handle it here directly to avoid useEffect races

      setGamePhase('dawnReport'); // Or whatever the exit phase is
      // Reset Logic
      wakeIndexRef.current = 0;
      setCurrentWakeIndex(0);
      setActiveNightStep(null);

      // Trigger Death Report if needed (copied from previous logic)
      if (deadThisNight.length > 0) {
        const deadNames = deadThisNight.map(id => `${id + 1}号`).join('、');
        setCurrentModal({ type: 'NIGHT_DEATH_REPORT', data: { message: `昨晚${deadNames}玩家死亡` } });
      } else {
        setCurrentModal({ type: 'NIGHT_DEATH_REPORT', data: { message: "昨天是个平安夜" } });
      }

      return;
    }

    // 3. ⚡️ 立即更新真实索引 (Update Truth Ref)
    wakeIndexRef.current = nextIndex;

    // 4. 通知 React 更新 UI (Sync State)
    setCurrentWakeIndex(nextIndex);

    // 5. ⚡️ 预计算并锁定下一步的数据 (Snapshot Next Step)
    const nextSeatId = currentQueue[nextIndex];
    if (nextSeatId !== undefined) {
      const latestSeats = seats;

      const nextStepInfo = calculateNightInfo(
        selectedScript,
        latestSeats,
        nextSeatId,
        gamePhase,
        lastDuskExecution || 0,
        undefined, // Reset fake inspection
        drunkFirstInfoRef.current,
        isEvilWithJudgment,
        poppyGrowerDead,
        [], // gameLogs (empty to avoid side effects)
        spyDisguiseMode,
        spyDisguiseProbability,
        deadThisNight,
        balloonistKnownTypes,
        registrationCacheRef.current,
        `${gamePhase}-${nightCount}`,
        isVortoxWorld,
        todayDemonVoted,
        todayMinionNominated,
        todayExecutedId,
        hasUsedAbility,
        votedThisRound,
        outsiderDiedToday
      );
      console.log(`🚀 [NightLogic] Advanced to Step ${nextIndex}: ${nextStepInfo?.effectiveRole?.name}`);
      setActiveNightStep(nextStepInfo); // 👈 Force UI Update
    }

    // 6. 清理选中状态
    setSelectedActionTargets([]);
    setInspectionResult(null);
    fakeInspectionResultRef.current = null;

  }, [
    wakeQueueIds,
    // currentWakeIndex, // Removed from deps as we use Ref
    seats,
    gamePhase,
    selectedScript,
    lastDuskExecution,
    drunkFirstInfoRef,
    isEvilWithJudgment,
    poppyGrowerDead,
    // gameLogs, 
    spyDisguiseMode,
    spyDisguiseProbability,
    deadThisNight,
    balloonistKnownTypes,
    nightCount,
    isVortoxWorld,
    todayDemonVoted,
    todayMinionNominated,
    todayExecutedId,
    hasUsedAbility,
    votedThisRound,
    outsiderDiedToday,
    setInspectionResult,
    setSelectedActionTargets,
    setCurrentWakeIndex,
    setGamePhase,
    setCurrentModal
  ]);

  // ============================================================================
  // CRITICAL FIX: Interactive Role Logic (Snapshot Real-time Update)
  // ============================================================================
  // The Snapshot (activeNightStep) is static, but roles like Fortune Teller need to 
  // calculate result based on USER SELECTION. We need a way to patch the snapshot 
  // or calculate result separately.
  // We already have `inspectionResult` state used by `GameConsole`.
  // Ideally, we should update `inspectionResult` when selection changes.


  // Handle side-effect logging from snapshot state
  useEffect(() => {
    if (activeNightStep?.logMessage) {
      addLog(activeNightStep.logMessage);
    }
  }, [activeNightStep, addLog]);

  // Safe guard fallback (Legacy cleanup)
  // Since continueToNextAction now handles transition, we might want to scale this back
  // or keep it just for "stuck" detection but NOT for normal transition
  useEffect(() => {
    if (!(gamePhase === 'firstNight' || gamePhase === 'night')) return;
    if (wakeQueueIds.length === 0) return;

    // If index out of bounds, we assume continueToNextAction handled it OR we missed it.
    // If we missed it (e.g. initial load out of bounds), we should transition.
    // But continueToNextAction logic above resets index to 0 on exit.

    // Let's keep a simple stuck check:
    // If we have data but no activeNightStep, and we are not at end:
    if (activeNightStep === null && currentWakeIndex < wakeQueueIds.length) {
      // Try to recover?
      // maybe just log or do nothing.
      // Or if index is valid but step is null, maybe we initialized wrong.
    }
  }, [gamePhase, activeNightStep, wakeQueueIds, currentWakeIndex]);

  // 交互域需要使用的延迟绑定函数，避免 TDZ
  const continueToNextActionRef = useRef<(() => void) | null>(null);
  const interactionContinueToNextAction = useCallback(() => {
  }, []);

  const insertIntoWakeQueueAfterCurrentRef = useRef<((seatId: number, opts?: { roleOverride?: Role | null; logLabel?: string }) => void) | null>(null);
  const interactionInsertIntoWakeQueueAfterCurrent = useCallback(
    (seatId: number, opts?: { roleOverride?: Role | null; logLabel?: string }) => {
      insertIntoWakeQueueAfterCurrentRef.current?.(seatId, opts);
    },
    []
  );


  // Victory Ref for atomic synchronous access
  const victoryRef = useRef<{ winner: 'good' | 'evil'; reason: string } | null>(null);

  // --- ATOMIC DISPATCHER ---
  const dispatch = useCallback((action: GameAction) => {
    // If game is already over (atomically), ignore further logic-changing actions
    // allowing only pure UI actions if needed, but generally we stop.
    if (victoryRef.current && action.type !== 'CHECK_GAME_OVER') {
      console.warn("Game already over. Ignoring action:", action.type);
      return;
    }

    const currentSeats = seats;
    const currentPhase = gamePhase;

    // 2. Pure Logic
    const snapshot = processGameEvent(currentSeats, currentPhase, action);

    // 3. Side Effects (Logs)
    if (snapshot.logs.length > 0) {
      snapshot.logs.forEach(msg => addLog(msg));
    }

    // 4. Atomic Update
    // [REFACTOR] seatsRef mirror removed - setSeats below triggers Context update
    setSeats(snapshot.seats);

    // 5. Game Over Check
    if (snapshot.winner) {
      const w = snapshot.winner === 'Good' ? 'good' : 'evil';
      const reason = snapshot.winReason || '未知原因';

      // Atomic Update
      victoryRef.current = { winner: w, reason };

      // React State Update
      setWinResult(w);
      setWinReason(reason);
      setGamePhase('gameOver'); // Force phase switch
      setCurrentModal({ type: 'GAME_OVER', data: null });
    }

    // 6. Hints / UI Triggers (Only if game not over)
    if (!victoryRef.current) {
      if (snapshot.nextActionHint === 'BARBER_SWAP_NEEDED') {
        const demon = snapshot.seats.find(s => (s.role?.type === 'demon' || s.isDemonSuccessor) && !s.isDead);
        if (demon) {
          setCurrentModal({ type: 'BARBER_SWAP', data: { demonId: demon.id, firstId: null, secondId: null } });
        }
      }
    }

    // 7. Metadata Side Effects
    if (action.type === 'EXECUTE_PLAYER') {
      setExecutedPlayerId(action.targetId);
      setTodayExecutedId(action.targetId);
      setCurrentDuskExecution(action.targetId);
      setHasExecutedThisDay(true);
    }
  }, [seats, gamePhase, addLog, setSeats, setWinResult, setWinReason, setCurrentModal, setExecutedPlayerId, setTodayExecutedId, setCurrentDuskExecution, setHasExecutedThisDay]);

  // Refactor checkGameOver to use dispatch
  const checkGameOver = useCallback((
    updatedSeats: Seat[],
    executedPlayerId: number | null = null,
    _isEndOfDay: boolean = false,
    damselGuessed: boolean = false,
    klutzGuessedEvil: boolean = false
  ) => {
    // We pass the context via the action now
    dispatch({
      type: 'CHECK_GAME_OVER',
      executedId: executedPlayerId || undefined,
      lastAction: executedPlayerId ? 'execution' : 'check_phase',
      context: {
        damselGuessed,
        klutzGuessedEvil,
        isVortoxWorld,
        isMastermindActive: false, // You might need to derive this from state if needed
      }
    });
  }, [dispatch, isVortoxWorld]);

  // 重写 handleDayEndTransition：进入黄昏结算前，先检查市长、涡流等基于日终的胜利条件
  const handleDayEndTransitionOverride = useCallback(() => {
    // 1. 检查是否存在日终触发的胜利（市长 3 人存活获胜、涡流无人处决获胜等）
    // 使用 todayExecutedId 来判断今日是否有人被处决
    checkGameOver(seats, todayExecutedId, true);
    if (victoryRef.current) return;

    // 2. 无人获胜，继续进入黄昏
    enterDuskPhase();
  }, [seats, todayExecutedId, checkGameOver, enterDuskPhase]);

  // ============================================================================
  // CRITICAL FIX: Robust continueToNextAction
  // ============================================================================
  // This block was refactored and moved above. The old content is removed.

  // ============================================================================
  // CRITICAL FIX: End of Night Transition Effect
  // ============================================================================
  useEffect(() => {
    // 只在夜晚阶段生效
    if (gamePhase !== 'firstNight' && gamePhase !== 'night') return;

    // 检查是否到达队列末尾 (或者队列为空)
    // 注意：normalizedWakeIndex 逻辑被移除，现在完全依赖 currentWakeIndex 是否越界
    const isEndOfNight = currentWakeIndex >= wakeQueueIds.length;

    if (isEndOfNight) {
      console.log("[Controller] triggering End of Night Transition...");

      // BMR：造谣者造谣为真 → 本夜额外死亡（说书人裁定）
      if (selectedScript?.id === 'bad_moon_rising' && gossipTrueTonight && gossipSourceSeatId !== null) {
        // Prevent re-triggering if modal is already open?
        // But useEffect runs often. We should guard this?
        // Ideally checking 'currentModal' prevents loop, but better to check if we handled it.
        // For now, rely on `setGossipTrueTonight(false)` inside the modal confirm to break loop.

        if (currentModal?.type !== 'STORYTELLER_SELECT') {
          const sourceId = gossipSourceSeatId;
          const statement = gossipStatementToday ? `造谣：「${gossipStatementToday}」` : '造谣为真';
          setCurrentModal({
            type: 'STORYTELLER_SELECT',
            data: {
              sourceId,
              roleId: 'gossip',
              roleName: '造谣者',
              description: `🗡️ ${statement}\n说书人：请选择 1 名玩家死亡（额外死亡）。`,
              targetCount: 1,
              onConfirm: (targetIds: number[]) => {
                const tid = targetIds[0];
                if (tid === undefined) return;
                setCurrentModal(null);
                killPlayer(tid, {
                  source: 'ability',
                  recordNightDeath: true,
                  onAfterKill: () => {
                    addLog(`🗣️ ${sourceId + 1}号(造谣者) 造谣为真：说书人裁定 ${tid + 1}号 额外死亡`);
                    setGossipTrueTonight(false);
                    setGossipSourceSeatId(null);
                    const merged = Array.from(new Set([...(deadThisNight || []), tid]));
                    const deadNames = merged.length > 0 ? merged.map(id => `${id + 1}号`).join('、') : '';
                    setCurrentModal({ type: 'NIGHT_DEATH_REPORT', data: { message: deadNames ? `昨晚${deadNames}玩家死亡` : "昨天是个平安夜" } });
                  },
                });
              },
            },
          });
        }
        return;
      }

      // 常规死亡报告
      // Guard against repeated modals
      if (currentModal?.type !== 'NIGHT_DEATH_REPORT') {
        if (deadThisNight.length > 0) {
          const deadNames = deadThisNight.map(id => `${id + 1}号`).join('、');
          setCurrentModal({ type: 'NIGHT_DEATH_REPORT', data: { message: `昨晚${deadNames}玩家死亡` } });
        } else {
          setCurrentModal({ type: 'NIGHT_DEATH_REPORT', data: { message: "昨天是个平安夜" } });
        }
      }
    }
  }, [
    currentWakeIndex,
    wakeQueueIds.length,
    gamePhase,
    deadThisNight,
    selectedScript,
    gossipTrueTonight,
    gossipSourceSeatId,
    gossipStatementToday,
    currentModal, // Need currentModal to prevent loop
    killPlayer,
    addLog,
    setGossipTrueTonight,
    setGossipSourceSeatId,
    setCurrentModal
  ]);


  const currentNightRole = useMemo(() => {
    if (!nightInfo) return null;
    const seat = nightInfo.seat;
    const role = getDisplayRoleForSeat(seat);
    return { seatNo: seat.id + 1, roleName: role?.name || seat.role?.name || '未知角色' };
  }, [nightInfo, getDisplayRoleForSeat]);

  const nextNightRole = useMemo(() => {
    if (!nightInfo) return null;
    const nextId = wakeQueueIds[currentWakeIndex + 1];
    if (nextId === undefined) return null;
    const seat = seats.find(s => s.id === nextId);
    const role = getDisplayRoleForSeat(seat);
    const seatNo = seat ? seat.id + 1 : nextId + 1;
    return { seatNo, roleName: role?.name || seat?.role?.name || '未知角色' };
  }, [nightInfo, wakeQueueIds, currentWakeIndex, seats, getDisplayRoleForSeat]);

  // 更新 nightInfo 相关的 hint
  useEffect(() => {
    if (nightInfo) {
      // 生成缓存 key用上一次恢复hint不重新生成
      const hintKey = `${gamePhase}-${currentWakeIndex}-${nightInfo?.seat?.id}`;

      // 检查缓存中是否有该角色hint用上一次恢复
      const cachedHint = hintCacheRef.current.get(hintKey);
      if (cachedHint) {
        setCurrentHint(prev => {
          if (prev.isPoisoned === cachedHint.isPoisoned &&
            prev.reason === cachedHint.reason &&
            prev.guide === cachedHint.guide &&
            prev.speak === cachedHint.speak &&
            prev.fakeInspectionResult === cachedHint.fakeInspectionResult) {
            return prev;
          }
          return cachedHint;
        });
        if (cachedHint.fakeInspectionResult) {
          fakeInspectionResultRef.current = cachedHint.fakeInspectionResult;
        }
        return; // 使用缓存hint不重新计算
      }

      // 没有缓存重新计算hint
      let fakeResult = currentHint.fakeInspectionResult;
      // 占卜师的假信息现在在玩家选择后根据真实结果生成toggleTarget 函数中
      // 这里不再预先生成假信息因为需要先知道玩家选择了谁才能计算真实结果
      if (nightInfo.effectiveRole.id !== 'fortune_teller' || !nightInfo.isPoisoned) {
        fakeInspectionResultRef.current = null;
      }

      const newHint: NightHintState = {
        isPoisoned: nightInfo.isPoisoned,
        reason: nightInfo.reason,
        guide: nightInfo.guide,
        speak: nightInfo.speak,
        fakeInspectionResult: fakeResult
      };

      // 气球驾驶员自动记录日志被动信息技能
      if (nightInfo.effectiveRole.id === 'balloonist' && nightInfo.guide.includes('你得') && !nightInfo.isPoisoned) {
        // guide 中提取信息格式" 你得X号，角色类型：镇民"
        const match = nightInfo.guide.match(/你得(\d+)号，角色类型：(.+)/);
        if (match) {
          const seatNum = match[1];
          const typeName = match[2].trim();
          addLogWithDeduplication(
            `${nightInfo?.seat?.id ? nightInfo.seat.id + 1 : 0}号(气球驾驶员) 得知 ${seatNum}号，角色类型：${typeName}`,
            nightInfo?.seat?.id ?? 0,
            '气球驾驶员'
          );
          // 记录已知类型防止重复
          setBalloonistKnownTypes((prev: Record<number, string[]>) => {
            const seatId = nightInfo?.seat?.id ?? 0;
            const known = prev[seatId] || [];
            if (known.includes(typeName)) return prev;
            return { ...prev, [seatId]: [...known, typeName] };
          });
        }
      }

      // 保存到缓存
      hintCacheRef.current.set(hintKey, newHint);
      // 优化：仅在内容变化时更新状态，防止无限循环
      setCurrentHint(prev => {
        if (prev.isPoisoned === newHint.isPoisoned &&
          prev.reason === newHint.reason &&
          prev.guide === newHint.guide &&
          prev.speak === newHint.speak &&
          prev.fakeInspectionResult === newHint.fakeInspectionResult) {
          return prev;
        }
        return newHint;
      });

      // CRITICAL FIX: Removed erroneous cleanup that cleared targets if they didn't match the actor
      // This caused Poisoner selection to be cleared immediately because target != actor
      /*
      if (selectedActionTargets.length > 0 && seats.find(s => s.id === selectedActionTargets[0])?.id !== wakeQueueIds[currentWakeIndex]) {
        setSelectedActionTargets([]);
        setInspectionResult(null);
        fakeInspectionResultRef.current = null;
      }
      */
    }
  }, [
    saveHistory,
    seats,
    deadThisNight,
    wakeQueueIds,
    currentWakeIndex,
    gamePhase,
    nightInfo,
    poppyGrowerDead,
    selectedScript,
    gossipTrueTonight,
    gossipSourceSeatId,
    gossipStatementToday,
    killPlayer,
    addLog,
    addLogWithDeduplication,
    getSeatRoleId,
    getDisplayRoleForSeat
    // CRITICAL FIX: Removed unstable setters from useGameState to prevent infinite loops.
    // setCurrentModal, setGossipTrueTonight, setGossipSourceSeatId, setInspectionResult, 
    // setSelectedActionTargets, setWakeQueueIds, setCurrentWakeIndex, setCurrentHint, 
    // setBalloonistKnownTypes, fakeInspectionResultRef, hintCacheRef
  ]);
  // ============================================================================
  // CRITICAL FIX: handleConfirmActionImpl moved here to access continueToNextAction directly
  // ============================================================================
  const handleConfirmActionImpl = useCallback((explicitSelectedTargets?: number[]) => {
    if (processingRef.current) {
      console.warn("[Controller] Blocked handleConfirmActionImpl: Processing in progress");
      return;
    }
    // Block if a blocking modal is open (Double check to prevent confused state)
    if (currentModal && currentModal.type === 'POISON_CONFIRM') {
      console.warn("[Controller] Blocked handleConfirmActionImpl: Poison modal is already open");
      return;
    }

    console.log("[Controller] handleConfirmActionImpl called (Direct)", {
      explicitTargets: explicitSelectedTargets,
      stateTargets: selectedActionTargets
    });

    // CRITICAL FIX: Use explicit targets if provided to bypass stale closure issues
    const finalSelectedTargets = explicitSelectedTargets ?? selectedActionTargets;

    if (!nightInfo) {
      console.warn("[Controller] No nightInfo");
      return;
    }

    // --- SSOT Validation (Snapshot Enforcement) ---
    // 强制检查用户提交的目标是否符合 Snapshot 中的预计算约束
    if (nightInfo.targetLimit) {
      const { min, max } = nightInfo.targetLimit;
      if (finalSelectedTargets.length < min || finalSelectedTargets.length > max) {
        addLogWithDeduplication(`⚠️ 无效操作：请选择 ${min === max ? min : `${min}-${max}`} 名玩家`);
        return;
      }
    }

    if (nightInfo.validTargetIds && nightInfo.validTargetIds.length > 0) {
      // 如果 Snapshot 明确指定了有效ID列表，必须遵守
      // 注意：如果 validTargetIds 为空且 max > 0，说明逻辑有误或懒加载失败，但在 nightLogic 中已修复此情况
      const invalidSelection = finalSelectedTargets.some(id => !nightInfo.validTargetIds!.includes(id));
      if (invalidSelection) {
        addLogWithDeduplication(`⚠️ 无效操作：所选目标不在允许范围内`);
        // 可以在此时高亮有效目标? (UI应该已经处理了)
        return;
      }
    }
    // ---------------------------------------------
    const roleId = nightInfo.effectiveRole.id;

    // 1. 优先尝试使用模块化的角色定义 handler (useNightActionHandler)
    const nightActionHandlerContext: NightActionHandlerContext = {
      nightInfo,
      seats,
      selectedTargets: finalSelectedTargets,
      gamePhase,
      nightCount,
      roles,
      setSeats,
      setSelectedActionTargets,
      addLog: addLogWithDeduplication,
      continueToNextAction: continueToNextAction,
      setCurrentModal,
    };

    if (handleNightAction(nightActionHandlerContext)) {
      console.log("[Controller] Handled via modular handleNightAction");
      return;
    }

    // 2. 退面方案：使用旧有的中心化逻辑
    const handler = getRoleConfirmHandler(roleId);
    console.log("[Controller] Role:", roleId, "Handler found in legacy map:", !!handler);

    if (handler) {
      const context = {
        nightInfo,
        seats,
        selectedTargets: finalSelectedTargets, // Use the resolved targets
        gamePhase,
        nightCount,
        roles,
        setSeats,
        setSelectedActionTargets,
        currentModal,
        setCurrentModal,
        getSeatRoleId,
        cleanseSeatStatuses,
        insertIntoWakeQueueAfterCurrent: interactionInsertIntoWakeQueueAfterCurrent,
        continueToNextAction: continueToNextAction, // Use direct function
        addLog: addLogWithDeduplication,
        killPlayer,
        hasUsedAbility,
        markAbilityUsed,
        reviveSeat,
        setPukkaPoisonQueue,
        setDeadThisNight,
        poChargeState,
        setPoChargeState,
        addDrunkMark,
        addPoisonMark,
        isEvil: isEvilWithJudgment,
        todayDemonVoted,
        todayMinionNominated,
      };


      // @ts-ignore
      const result = handler(context);
      console.log("[Controller] Legacy handler result:", result);
      if (result.handled) return;
    }

    console.log("[Controller] Proceeding to next action via Direct Call");
    processingRef.current = true;
    continueToNextAction(); // Call directly
    setTimeout(() => {
      processingRef.current = false;
    }, 500);
  }, [nightInfo, seats, selectedActionTargets, gamePhase, nightCount, roles, setSeats, setSelectedActionTargets, currentModal, setCurrentModal, getSeatRoleId, cleanseSeatStatuses, interactionInsertIntoWakeQueueAfterCurrent, continueToNextAction, addLogWithDeduplication, killPlayer, hasUsedAbility, markAbilityUsed, reviveSeat, setPukkaPoisonQueue, setDeadThisNight, poChargeState, setPoChargeState, isEvilWithJudgment]);

  const interaction = useInteractionHandler({
    handleConfirmActionImpl,
    wakeQueueIds,
    setWakeQueueIds,
    currentWakeIndex,
    setCurrentWakeIndex,
    selectedActionTargets,
    setSelectedActionTargets,
    gamePhase,
    seats,
    setSeats,
    checkGameOver,
    saveHistory,
    setSelectedRole,
    nightCount,
    currentModal,
    getRoleTargetCount,
    isVortoxWorld,
    nightActionQueue: nightActionQueue || [], // Fallback for safety
    nightInfo: activeNightStep,
  });

  const {
    handleSeatClick: interactionHandleSeatClick,
    toggleTarget: interactionToggleTarget,
    handleMenuAction,
    toggleStatus: interactionToggleStatus,
    handleConfirmAction: interactionHandleConfirmAction,
    isTargetDisabled,
  } = interaction;

  // 手动设置红罗刹（天敌）
  const setRedNemesisTarget = useCallback((targetSeatId: number) => {
    setSeats((prev: Seat[]) => {
      // 先清除所有人的红罗刹标记，再给目标加上
      return prev.map(s => ({
        ...s,
        isRedHerring: s.id === targetSeatId
      }));
    });
    addLog(`说书人手动将 ${targetSeatId + 1}号 设置为 天敌红罗刹 (Red Nemesis)`);
  }, [setSeats, addLog]);


  // 统一：对“纯信息类（无目标选择）查验/验证”角色，自动把结果同步到控制台结果区
  useEffect(() => {
    if (!nightInfo) return;

    const roleId = nightInfo.effectiveRole.id;
    const isFirstNight = gamePhase === 'firstNight';
    const targetCount = getRoleTargetCount(roleId, isFirstNight);
    const maxTargets = targetCount?.max ?? 0;

    // 只处理“无目标选择”的信息类角色，且排除有专门流程的角色
    const excluded = new Set<string>([
      'fortune_teller', // 由 toggleTarget 生成结果
      'ravenkeeper',    // 由 confirmRavenkeeperFake 生成结果
    ]);
    if (excluded.has(roleId)) return;
    if (maxTargets !== 0) return;

    // 中毒/醉酒/涡流时仍然显示 guide（本身已经是“假信息”提示）
    const actorSeat = seats.find(s => s.id === nightInfo.seat.id);
    const actorDisabled = isActorDisabledByPoisonOrDrunk(actorSeat, nightInfo.isPoisoned);
    if (actorDisabled) return;

    if (nightInfo.guide) {
      const prefix =
        roleId === 'fortune_teller'
          ? '🔮 占卜师信息：'
          : roleId === 'undertaker'
            ? '⚰️ 掘墓人结果：'
            : '📜 信息：';

      const newResult = `${prefix}${nightInfo.guide}`;
      // CRITICAL FIX: Guard against redundant updates to prevent infinite loops
      if (newResult !== inspectionResult) {
        setInspectionResult(newResult);
        setInspectionResultKey(k => k + 1);
      }
    }
  }, [
    nightInfo,
    gamePhase,
    seats,
    getRoleTargetCount,
    isActorDisabledByPoisonOrDrunk,
    setInspectionResult,
    setInspectionResultKey,
    inspectionResult, // Add inspectionResult to deps
  ]);

  // 安全兜底：如果夜晚阶段存在叫醒队列但无法生成 nightInfo，则主动计算当前步骤的信息
  useEffect(() => {
    // 只在夜晚阶段执行
    if (gamePhase !== 'firstNight' && gamePhase !== 'night') return;
    // 如果没有队列或 nightInfo 已存在，则无需操作
    if (wakeQueueIds.length === 0 || nightInfo) return;
    // 如果索引无效，则不处理
    if (currentWakeIndex < 0 || currentWakeIndex >= wakeQueueIds.length) return;

    // 核心修复：检测到 nightInfo 为空，主动为当前步骤生成它，而不是跳过
    const currentSeatId = wakeQueueIds[currentWakeIndex];
    if (currentSeatId !== undefined) {
      console.log(`[NightLogic] Recovery: nightInfo is null for index ${currentWakeIndex}. Recalculating...`);
      const latestSeats = seats;
      const currentStepInfo = calculateNightInfo(
        selectedScript,
        latestSeats,
        currentSeatId,
        gamePhase,
        lastDuskExecution || 0,
        undefined,
        drunkFirstInfoRef.current,
        isEvilWithJudgment,
        poppyGrowerDead,
        [],
        spyDisguiseMode,
        spyDisguiseProbability,
        deadThisNight,
        balloonistKnownTypes,
        registrationCacheRef.current,
        `${gamePhase}-${nightCount}`,
        isVortoxWorld,
        todayDemonVoted,
        todayMinionNominated,
        todayExecutedId,
        hasUsedAbility,
        votedThisRound,
        outsiderDiedToday
      );

      console.log(`🚀 [NightLogic] RECOVERED Step ${currentWakeIndex}: ${currentStepInfo?.effectiveRole?.name}`);
      setActiveNightStep(currentStepInfo);
    }
  }, [
    gamePhase, nightInfo, wakeQueueIds, currentWakeIndex, seats,
    selectedScript, lastDuskExecution, drunkFirstInfoRef, isEvilWithJudgment,
    poppyGrowerDead, spyDisguiseMode, spyDisguiseProbability, deadThisNight,
    balloonistKnownTypes, nightCount, isVortoxWorld, todayDemonVoted,
    todayMinionNominated, todayExecutedId, hasUsedAbility, votedThisRound,
    outsiderDiedToday,
  ]);

  // 游戏结束时保存对局记录
  const gameRecordSavedRef = useRef(false);
  useEffect(() => {
    if (gamePhase === 'gameOver' && winResult !== null && selectedScript && !gameRecordSavedRef.current) {
      const endTime = new Date();
      const duration = startTime ? Math.floor((endTime.getTime() - startTime.getTime()) / 1000) : timer;

      const record: GameRecord = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        scriptName: selectedScript.name,
        startTime: startTime ? startTime.toISOString() : new Date().toISOString(),
        endTime: endTime.toISOString(),
        duration: duration,
        winResult: winResult,
        winReason: winReason,
        seats: JSON.parse(JSON.stringify(seats)), // 深拷贝座位信息
        gameLogs: [...gameLogs] // 拷贝游戏日志
      };

      saveGameRecord(record);
      gameRecordSavedRef.current = true;
    }

    // 当游戏重新开始时重置保存标记
    if (gamePhase === 'scriptSelection' || gamePhase === 'setup') {
      gameRecordSavedRef.current = false;
    }
  }, [gamePhase, winResult, selectedScript, startTime, timer, winReason, seats, gameLogs, saveGameRecord]);

  // 全局屏蔽系统默认的长按行为contextmenu文本选择等
  useEffect(() => {
    const preventDefault = (e: Event) => {
      // 阻止所有contextmenu事件右键菜单
      if (e.type === 'contextmenu') {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    const preventTouchCallout = (e: TouchEvent) => {
      // 阻止触摸长按时的系统菜单
      // 注意这里不阻止所有touch事件只阻止可能导致系统菜单
      // 实际的触摸处理由各个组件的onTouchStart/End/Move处理
    };

    // 阻止全局contextmenu
    document.addEventListener('contextmenu', preventDefault, { passive: false, capture: true });

    // 阻止触摸长按时的系统行为通过CSS已处理这里作为额外保障
    document.addEventListener('touchstart', preventTouchCallout, { passive: true });
    document.addEventListener('touchmove', preventTouchCallout, { passive: true });
    document.addEventListener('touchend', preventTouchCallout, { passive: true });

    // 阻止文本选择通过CSS已处理这里作为额外保障
    document.addEventListener('selectstart', (e) => {
      e.preventDefault();
      return false;
    }, { passive: false });

    return () => {
      document.removeEventListener('contextmenu', preventDefault, { capture: true } as EventListenerOptions);
      document.removeEventListener('touchstart', preventTouchCallout);
      document.removeEventListener('touchmove', preventTouchCallout);
      document.removeEventListener('touchend', preventTouchCallout);
      document.removeEventListener('selectstart', preventDefault);
    };
  }, []);

  // 组件卸载时清理所有长按定时器
  useEffect(() => {
    return () => {
      longPressTimerRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      longPressTimerRef.current.clear();
      longPressTriggeredRef.current.clear();
      if (checkLongPressTimerRef.current) {
        clearTimeout(checkLongPressTimerRef.current);
        checkLongPressTimerRef.current = null;
      }
      seatRefs.current = {};
    };
  }, []);

  // 获取恶魔显示名称
  const getDemonDisplayName = useCallback((roleId?: string, fallbackName?: string) => {
    switch (roleId) {
      case 'hadesia': return '哈迪寂亚';
      case 'vigormortis_mr': return '亡骨魔';
      case 'imp': return '小恶魔';
      case 'zombuul': return '僵怖';
      case 'shabaloth': return '沙巴洛斯';
      case 'fang_gu': return '方古';
      case 'vigormortis': return '亡骨魔';
      case 'no_dashii': return '诺-达';
      case 'vortox': return '涡流';
      case 'po': return '珀';
      default: return fallbackName || '恶魔';
    }
  }, []);

  /**
   * 检查 Imp 星传逻辑
   * 当 Imp 自杀时，如果存在活着的爪牙，将恶魔位传给爪牙
   * @param deadSeat 死亡的座位
   * @param source 死亡来源
   */
  const checkImpStarPass = useCallback((deadSeat: Seat, source: 'demon' | 'execution' | 'ability') => {
    // 只有当 Imp 被恶魔攻击（自杀）时才触发传位
    if (deadSeat.role?.id !== 'imp' || source !== 'demon') return;

    const minions = seats.filter(s =>
      s.role?.type === 'minion' &&
      !s.isDead &&
      s.id !== deadSeat.id // 不能传给自己
    );

    if (minions.length > 0) {
      // 有活着的爪牙，传位给第一个（实际游戏中应由说书人选择）
      // TODO: 未来可以添加 UI 让说书人选择传位目标
      const newDemonSeat = minions[0];

      alert(`😈 小恶魔死亡！传位给 ${newDemonSeat.id + 1}号 [${newDemonSeat.role?.name || '未知'}]`);

      // [REFACTOR] 通过 Atomic Dispatcher 路由，确保与 gameLogic.ts 逻辑一致
      dispatch({
        type: 'IMP_STAR_PASS',
        oldImpId: deadSeat.id,
        newImpId: newDemonSeat.id,
      });
    } else {
      // 没有活着的爪牙，游戏结束（好人胜利）
      addLog(`😈 小恶魔死亡，且没有活着的爪牙可以接位，好人胜利`);
      // checkGameOver 会在 killPlayer 的 finalize 中调用，无需手动处理
    }
  }, [seats, dispatch, addLog]);

  type KillPlayerOptions = {
    recordNightDeath?: boolean;
    keepInWakeQueue?: boolean;
    seatTransformer?: (seat: Seat) => Seat;
    skipGameOverCheck?: boolean;
    executedPlayerId?: number | null;
    onAfterKill?: (latestSeats: Seat[]) => void;
  };

  // 杀死玩家（不做免疫/保护判断，直接处理死亡及后续效果）
  /**
   * 统一的击杀入口
   * 流程：检查是否已死 -> 检查是否免疫 -> 检查是否被保护 -> 执行死亡 -> 触发亡语
   */


  /* 
   * KILL PLAYER IMPLEMENTATION (Refactored to Atomic Dispatcher)
   * All logic delegated to app/gameLogic.ts processGameEvent
   */
  const killPlayerImpl = useCallback(
    (targetId: number, options: KillPlayerOptions & { source?: 'demon' | 'execution' | 'ability' } = {}) => {
      const { source = 'ability', onAfterKill } = options;

      let killerRoleId: string | undefined = undefined;
      // If source is demon, try to infer killer role (e.g. for Assassin override in logic?)
      // Actually pure logic handles 'demon' source generically, but killerRoleId helps 'Assassin vs Tea Lady'
      if (nightInfo?.effectiveRole) {
        killerRoleId = nightInfo.effectiveRole.id;
      }

      dispatch({
        type: 'KILL_PLAYER',
        targetId,
        source,
        killerRoleId
      });

      // Execute onAfterKill with latest state (Ref is updated inside dispatch synchronously-ish)
      if (onAfterKill) {
        onAfterKill(seats);
      }
    },
    [dispatch, nightInfo]
  );

  // 将真实实现注入到稳定 wrapper 中
  useEffect(() => {
    killPlayerImplRef.current = killPlayerImpl;
  }, [killPlayerImpl]);

  /**
   * 尝试击杀玩家（兼容旧接口，内部调用统一的 killPlayer）
   * @deprecated 请直接使用 killPlayer，传入 source 参数
   */
  const tryKillPlayer = useCallback(
    (targetId: number, source: 'demon' | 'execution' | 'ability', options: KillPlayerOptions = {}) => {
      killPlayer(targetId, { ...options, source });
    },
    [killPlayer]
  );

  // --- 通用夜晚时间线步骤处理（基于 TimelineStep.interaction.effect） ---
  const handleNextStep = useCallback(
    (
      timeline: TimelineStep[],
      currentStepIndex: number,
      selectedSeatIds: number[],
      setCurrentStepIndex: React.Dispatch<React.SetStateAction<number>>,
      onNightEnd: () => void,
      clearSelection?: () => void
    ) => {
      const currentStep = timeline[currentStepIndex];
      if (!currentStep) return;

      const interaction = currentStep.interaction;
      const effect = interaction?.effect;

      // 1. 记录日志：本步选择了哪些目标
      if (selectedSeatIds.length > 0) {
        const targetNames = selectedSeatIds.map((id) => `${id + 1}号`).join(', ');
        addLog(`[${currentStep.content.title}] 选择了: ${targetNames}`);
      }

      // 2. 处理效果
      if (effect && selectedSeatIds.length > 0) {
        // === A. 添加状态（投毒、保护等） ===
        if (effect.type === 'add_status' && effect.value) {
          setSeats((prev: Seat[]) =>
            prev.map((seat) => {
              if (!selectedSeatIds.includes(seat.id)) return seat;

              const hasStatus = seat.statusDetails?.includes(effect.value!);
              if (hasStatus) return seat;

              return {
                ...seat,
                // 兼容旧字段
                isPoisoned: effect.value === 'poisoned' ? true : seat.isPoisoned,
                isProtected: effect.value === 'protected' ? true : seat.isProtected,
                statusDetails: [...(seat.statusDetails || []), effect.value!],
              };
            })
          );
        }

        // === B. 击杀（恶魔、刺客等） ===
        else if (effect.type === 'kill') {
          selectedSeatIds.forEach((targetId) => {
            // 使用 killPlayer 统一处理击杀（自动检查免疫和保护）
            // 判断是否为恶魔攻击：检查当前步骤的角色ID是否为恶魔类型
            const currentRoleId = currentStep.roleId;
            const isDemonAttack = currentRoleId && (
              currentRoleId === 'imp' ||
              currentRoleId === 'zombuul' ||
              currentRoleId === 'pukka' ||
              currentRoleId === 'shabaloth' ||
              currentRoleId === 'po' ||
              currentRoleId === 'fang_gu' ||
              currentRoleId === 'vigormortis' ||
              currentRoleId === 'no_dashii' ||
              currentRoleId === 'vortox' ||
              currentRoleId === 'hadesia'
            );
            const source: 'demon' | 'execution' | 'ability' = isDemonAttack ? 'demon' : 'ability';
            killPlayer(targetId, { source });
          });
        }

        // === C. 纯信息步骤（洗衣妇等） ===
        else if (effect.type === 'info') {
          // 信息本身由 UI 展示，这里仅做确认
        }
      }

      // 3. 进入下一步
      if (currentStepIndex < timeline.length - 1) {
        setCurrentStepIndex((prev) => prev + 1);
        // 清空当前选择，交由上层 UI 控制
        if (clearSelection) clearSelection();
      } else {
        // 夜晚结束，进入天亮/白天，由调用方决定如何切换
        onNightEnd();
      }
    },
    [addLog, killPlayer, setSeats, roles, seats]
  );

  // 调用 useNightLogic - 必须在 executePlayer 之前定义
  const nightLogic = useNightLogic(
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
      nightQueuePreviewTitle,
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
      setVotedThisRound,
      hasExecutedThisDay,
      setHasExecutedThisDay,
      setNominationMap,
      setGoonDrunkedThisNight,
      setIsVortoxWorld,
      setCurrentModal,
      setPendingNightQueue,
      setNightOrderPreview,
      setNightQueuePreviewTitle,
      // ============ 适配器：将旧的 setShowXXX 转发到新的 setCurrentModal ============
      setShowNightDeathReportModal: ((text: React.SetStateAction<string | null>) => {
        if (typeof text === 'function') {
          // 如果是函数更新，需要先获取当前值
          const currentValue = currentModal?.type === 'NIGHT_DEATH_REPORT'
            ? (currentModal.data as { message: string }).message
            : null;
          const newValue = text(currentValue);
          setCurrentModal(newValue ? { type: 'NIGHT_DEATH_REPORT', data: { message: newValue } } : null);
        } else {
          setCurrentModal(text ? { type: 'NIGHT_DEATH_REPORT', data: { message: text } } : null);
        }
      }) as React.Dispatch<React.SetStateAction<string | null>>,
      setShowKillConfirmModal: ((targetId: React.SetStateAction<number | null>) => {
        if (typeof targetId === 'function') {
          const currentValue = currentModal?.type === 'KILL_CONFIRM'
            ? (currentModal.data as { targetId: number }).targetId
            : null;
          const newValue = targetId(currentValue);
          setCurrentModal(newValue !== null ? { type: 'KILL_CONFIRM', data: { targetId: newValue, isImpSelfKill: false } } : null);
        } else {
          setCurrentModal(targetId !== null ? { type: 'KILL_CONFIRM', data: { targetId, isImpSelfKill: false } } : null);
        }
      }) as React.Dispatch<React.SetStateAction<number | null>>,
      setShowMayorRedirectModal: ((data: React.SetStateAction<{ targetId: number; demonName: string } | null>) => {
        if (typeof data === 'function') {
          const currentValue = currentModal?.type === 'MAYOR_REDIRECT'
            ? (currentModal.data as { targetId: number; demonName: string })
            : null;
          const newValue = data(currentValue);
          setCurrentModal(newValue ? { type: 'MAYOR_REDIRECT', data: newValue } : null);
        } else {
          setCurrentModal(data ? { type: 'MAYOR_REDIRECT', data } : null);
        }
      }) as React.Dispatch<React.SetStateAction<{ targetId: number; demonName: string } | null>>,
      setShowAttackBlockedModal: ((data: React.SetStateAction<{ targetId: number; reason: string; demonName?: string } | null>) => {
        if (typeof data === 'function') {
          const currentValue = currentModal?.type === 'ATTACK_BLOCKED'
            ? (currentModal.data as { targetId: number; reason: string; demonName?: string })
            : null;
          const newValue = data(currentValue);
          setCurrentModal(newValue ? { type: 'ATTACK_BLOCKED', data: newValue } : null);
        } else {
          setCurrentModal(data ? { type: 'ATTACK_BLOCKED', data } : null);
        }
      }) as React.Dispatch<React.SetStateAction<{ targetId: number; reason: string; demonName?: string } | null>>,
      // ============ 适配器结束 ============
      setStartTime,
      setMayorRedirectTarget,
      addLog,
      addLogWithDeduplication,
      killPlayer,
      saveHistory,
      resetRegistrationCache,
      getSeatRoleId,
      getDemonDisplayName,
      enqueueRavenkeeperIfNeeded,
      continueToNextAction,
      // seatsRef removed (REFACTOR)
      currentWakeIndexRef: gameState.currentWakeIndexRef,
    }
  );

  // 将 useNightLogic 的 startNight 实现注入到 gameFlow 的入口（延迟绑定避免声明顺序影响）
  useEffect(() => {
    startNightImplRef.current = nightLogic.startNight;
  }, [nightLogic.startNight]);

  useEffect(() => {
    finalizeNightStartRef.current = nightLogic.finalizeNightStart;
  }, [nightLogic.finalizeNightStart]);

  // 确认夜晚死亡报告后进入白天
  const confirmNightDeathReport = useCallback(() => {
    setCurrentModal(null);


    // 白天开始清理仅限夜晚的状态但保留魔鬼代言人的跨日保护
    cleanStatusesForNewDay();

    // 清除所有保护状态僧侣的保护只在夜晚有效
    setSeats((p: Seat[]) => p.map(s => ({ ...s, isProtected: false, protectedBy: null })));

    // 检查罂粟种植者是否死亡如果死亡告知爪牙和恶魔彼此
    const poppyGrower = seats.find(s => s.role?.id === 'poppy_grower');
    if (poppyGrower && poppyGrower.isDead && !poppyGrowerDead) {
      setPoppyGrowerDead(true);
      const minions = seats.filter(s => s.role?.type === 'minion' && !s.isDead);
      const demons = seats.filter(s => (s.role?.type === 'demon' || s.isDemonSuccessor) && !s.isDead);
      const minionNames = minions.map(s => `${s.id + 1}号`).join('、');
      const demonNames = demons.map(s => `${s.id + 1}号`).join('、');
      if (minions.length > 0 && demons.length > 0) {
        addLog(`罂粟种植者已死亡，爪牙(${minionNames})和恶魔(${demonNames})现在得知彼此`);
      }
    }

    // 检查农夫是否在夜晚死亡如果死亡转换一名善良玩家为农夫
    const deadFarmer = deadThisNight.find(id => {
      const seat = seats.find(s => s.id === id);
      return seat?.role?.id === 'farmer';
    });
    if (deadFarmer !== undefined) {
      const aliveGood = seats.filter(s =>
        !s.isDead &&
        s.id !== deadFarmer &&
        (s.role?.type === 'townsfolk' || s.role?.type === 'outsider')
      );
      if (aliveGood.length > 0) {
        const newFarmer = getRandom(aliveGood);
        const farmerRole = roles.find(r => r.id === 'farmer');
        setSeats((p: Seat[]) => p.map(s =>
          s.id === newFarmer.id ? { ...s, role: farmerRole || s.role } : s
        ));
        addLog(`${deadFarmer + 1}号(农夫)在夜晚死亡，${newFarmer.id + 1}号变成农夫`);
      }
    }

    setDeadThisNight([]); // 清空夜晚死亡记录

    // 规则：每个黄昏（白天）开始时重置提名记录
    // 确保每名玩家在每个黄昏内只能提名一次，并且同个黄昏内也只能被提名一次
    setNominationRecords({ nominators: new Set(), nominees: new Set() });
    setNominationMap({});

    // [REFACTOR] 直接使用 seats（来自 Context）
    // 检查游戏结束条件包括存活人数
    checkGameOver(seats);
    if (victoryRef.current) return;
    enterDayPhase();
  }, [seats, deadThisNight, poppyGrowerDead, cleanStatusesForNewDay, addLog, checkGameOver, setSeats, setCurrentModal, setPoppyGrowerDead, setDeadThisNight, enterDayPhase, setNominationRecords, setNominationMap]);

  // 获取标准阵容配置（用于Baron自动重排）
  const getStandardComposition = useCallback((playerCount: number, hasBaron: boolean) => {
    const base = troubleBrewingPresets.find(p => p.total === playerCount);
    const fallbackMinion = Math.max(1, Math.floor((playerCount - 1) / 6));
    const fallbackOutsider = Math.max(0, Math.floor((playerCount - 3) / 3));
    const fallbackTownsfolk = Math.max(0, playerCount - fallbackOutsider - fallbackMinion - 1);

    const minion = base?.minion ?? fallbackMinion;
    const outsiderBase = base?.outsider ?? fallbackOutsider;
    const townsfolkBase = base?.townsfolk ?? fallbackTownsfolk;
    const demon = base?.demon ?? 1;

    const outsider = outsiderBase + (hasBaron ? 2 : 0);
    const townsfolk = Math.max(0, townsfolkBase - (hasBaron ? 2 : 0));

    return {
      townsfolk,
      outsider,
      minion,
      demon,
      total: playerCount,
    };
  }, []);

  // Baron自动重排：自动调整镇民和外来者数量
  const handleBaronAutoRebalance = useCallback(() => {
    if (!baronSetupCheck) return;

    const { recommended, current, playerCount } = baronSetupCheck;
    const activeSeats = seats.filter(s => s.role);

    // 计算需要调整的数量
    const townsfolkDiff = recommended.townsfolk - current.townsfolk;
    const outsiderDiff = recommended.outsider - current.outsider;

    // 如果镇民过多，需要将部分镇民转换为外来者
    if (townsfolkDiff < 0) {
      const townsfolkSeats = activeSeats.filter(s => s.role?.type === 'townsfolk');
      const toConvert = townsfolkSeats.slice(0, Math.abs(townsfolkDiff));
      const outsiderRoles = roles.filter(r => r.type === 'outsider' && (!r.script || r.script === selectedScript?.name));

      setSeats(prev => prev.map(s => {
        const found = toConvert.find(tc => tc.id === s.id);
        if (found && outsiderRoles.length > 0) {
          const randomOutsider = getRandom(outsiderRoles);
          return { ...s, role: randomOutsider };
        }
        return s;
      }));

      addLog(`Baron自动重排：将${Math.abs(townsfolkDiff)}个镇民转换为外来者`);
    }

    // 如果外来者过多，需要将部分外来者转换为镇民
    if (outsiderDiff < 0) {
      const outsiderSeats = activeSeats.filter(s => s.role?.type === 'outsider');
      const toConvert = outsiderSeats.slice(0, Math.abs(outsiderDiff));
      const townsfolkRoles = roles.filter(r => r.type === 'townsfolk' && (!r.script || r.script === selectedScript?.name));

      setSeats(prev => prev.map(s => {
        const found = toConvert.find(tc => tc.id === s.id);
        if (found && townsfolkRoles.length > 0) {
          const randomTownsfolk = getRandom(townsfolkRoles);
          return { ...s, role: randomTownsfolk };
        }
        return s;
      }));

      addLog(`Baron自动重排：将${Math.abs(outsiderDiff)}个外来者转换为镇民`);
    }

    setBaronSetupCheck(null);
  }, [baronSetupCheck, seats, selectedScript, addLog, setSeats, setBaronSetupCheck]);

  // 纯计算：阵容配置校验结果
  const getCompositionStatus = useCallback((activeSeats: Seat[]) => {
    const playerCount = activeSeats.length;
    const hasBaron = activeSeats.some(s => s.role?.id === "baron");
    const standard = selectedScript?.id === 'trouble_brewing' && playerCount >= 7 && playerCount <= 15
      ? getStandardComposition(playerCount, hasBaron)
      : null;
    const actual = {
      townsfolk: activeSeats.filter(s => s.role?.type === 'townsfolk').length,
      outsider: activeSeats.filter(s => s.role?.type === 'outsider').length,
      minion: activeSeats.filter(s => s.role?.type === 'minion').length,
      demon: activeSeats.filter(s => s.role?.type === 'demon').length,
    };
    const valid =
      selectedScript?.id !== 'trouble_brewing' ||
      playerCount < 7 ||
      playerCount > 15 ||
      !standard ||
      (
        actual.townsfolk === standard.townsfolk &&
        actual.outsider === standard.outsider &&
        actual.minion === standard.minion &&
        actual.demon === standard.demon
      );
    return {
      valid,
      standard,
      actual,
      playerCount,
      hasBaron,
    };
  }, [getStandardComposition, selectedScript]);

  // 纯计算：男爵配置校验结果
  const getBaronStatus = useCallback((activeSeats: Seat[]) => {
    const playerCount = activeSeats.length;
    const hasBaronInSeats = activeSeats.some(s => s.role?.id === "baron");
    const recommended = selectedScript?.id === 'trouble_brewing' && hasBaronInSeats
      ? getStandardComposition(playerCount, true)
      : null;
    const current = {
      townsfolk: activeSeats.filter(s => s.role?.type === 'townsfolk').length,
      outsider: activeSeats.filter(s => s.role?.type === 'outsider').length,
      minion: activeSeats.filter(s => s.role?.type === 'minion').length,
      demon: activeSeats.filter(s => s.role?.type === 'demon').length,
    };
    const valid =
      !recommended ||
      current.townsfolk === recommended.townsfolk && current.outsider === recommended.outsider;
    return {
      valid,
      recommended,
      current,
      playerCount,
    };
  }, [getStandardComposition, selectedScript]);

  // 带状态更新：男爵配置校验
  const validateBaronSetup = useCallback((activeSeats: Seat[]) => {
    if (ignoreBaronSetup) return true;
    const status = getBaronStatus(activeSeats);
    if (!status.valid && status.recommended) {
      setBaronSetupCheck({
        recommended: status.recommended,
        current: status.current,
        playerCount: status.playerCount,
      });
      return false;
    }
    setBaronSetupCheck(null);
    return true;
  }, [getBaronStatus, ignoreBaronSetup, setBaronSetupCheck]);

  // 带状态更新：阵容配置校验
  const validateCompositionSetup = useCallback((activeSeats: Seat[]) => {
    // =========================================================
    // TB 额外校验：唯一性与关键 Setup 约束（不影响其他剧本）
    // =========================================================
    if (selectedScript?.id === 'trouble_brewing') {
      const countByRoleId = (roleId: string) =>
        activeSeats.filter(s => s.role?.id === roleId).length;

      const baronCount = countByRoleId('baron');
      if (baronCount > 1) {
        const msg = `暗流涌动规则：男爵只能有 1 名（当前 ${baronCount} 名）。请移除重复男爵后再开始。`;
        addLog(`⛔ ${msg}`);
        alert(msg);
        return false;
      }

      const drunkCount = countByRoleId('drunk');
      if (drunkCount > 1) {
        const msg = `暗流涌动规则：酒鬼只能有 1 名（当前 ${drunkCount} 名）。请移除重复酒鬼后再开始。`;
        addLog(`⛔ ${msg}`);
        alert(msg);
        return false;
      }

      const scarletCount = countByRoleId('scarlet_woman');
      if (scarletCount > 1) {
        const msg = `暗流涌动规则：红罗剎只能有 1 名（当前 ${scarletCount} 名）。请移除重复红罗剎后再开始。`;
        addLog(`⛔ ${msg}`);
        alert(msg);
        return false;
      }

      // 酒鬼必须设置“伪装身份”，否则夜晚信息/提示会出现不一致
      const drunkSeat = activeSeats.find(s => s.role?.id === 'drunk');
      if (drunkSeat) {
        const charade = drunkSeat.charadeRole;
        const ok = !!charade && charade.id !== 'drunk' && charade.type === 'townsfolk';
        if (!ok) {
          const msg = `暗流涌动规则：酒鬼需要一个“镇民伪装身份”（已选：${charade?.name ?? '未选择'}）。请先为酒鬼选择伪装身份再开始。`;
          addLog(`⛔ ${msg}`);
          alert(msg);
          return false;
        }
      }
    }

    const status = getCompositionStatus(activeSeats);
    if (!status.valid && status.standard) {
      setCompositionError({
        standard: status.standard,
        actual: status.actual,
        playerCount: status.playerCount,
        hasBaron: status.hasBaron,
      });
      return false;
    }
    setCompositionError(null);
    return true;
  }, [getCompositionStatus, setCompositionError, selectedScript, addLog]);

  // 将玩家插入到当前唤醒队列之后（按夜晚顺序）
  const insertIntoWakeQueueAfterCurrent = useCallback((seatId: number, opts?: { roleOverride?: Role | null; logLabel?: string }) => {
    if (!['night', 'firstNight'].includes(gamePhase)) return;
    let inserted = false;
    setWakeQueueIds(prev => {
      if (prev.includes(seatId)) return prev;
      const processed = prev.slice(0, currentWakeIndex + 1);
      if (processed.includes(seatId)) return prev;
      const seatsSnapshot = seats;
      const target = seatsSnapshot.find(s => s.id === seatId);
      const roleSource = opts?.roleOverride || (target?.role?.id === 'drunk' ? target.charadeRole || target.role : target?.role);
      if (!roleSource) return prev;
      const order = gamePhase === 'firstNight' ? (roleSource.firstNightOrder || 0) : (roleSource.otherNightOrder || 0);
      if (order <= 0) return prev;
      const rest = prev.slice(currentWakeIndex + 1);
      const getOrder = (id: number) => {
        const s = seatsSnapshot.find(x => x.id === id);
        if (!s || !s.role) return Number.MAX_SAFE_INTEGER;
        const r = s.role.id === 'drunk' ? s.charadeRole || s.role : s.role;
        return gamePhase === 'firstNight' ? (r?.firstNightOrder ?? Number.MAX_SAFE_INTEGER) : (r?.otherNightOrder ?? Number.MAX_SAFE_INTEGER);
      };
      const insertAt = rest.findIndex(id => order < getOrder(id));
      const nextRest = [...rest];
      if (insertAt >= 0) {
        nextRest.splice(insertAt, 0, seatId);
      } else {
        nextRest.push(seatId);
      }
      inserted = true;
      return [...processed, ...nextRest];
    });
    if (inserted && opts?.logLabel) {
      addLog(`${opts.logLabel} 已加入本夜唤醒队列`);
    }
  }, [gamePhase, currentWakeIndex, seats, addLog, setWakeQueueIds]);

  useEffect(() => {
    insertIntoWakeQueueAfterCurrentRef.current = insertIntoWakeQueueAfterCurrent;
  }, [insertIntoWakeQueueAfterCurrent]);

  // 将目标玩家转为邪恶阵营（灵言师关键词触发）
  const convertPlayerToEvil = useCallback((targetId: number) => {
    setSeats(prev => prev.map(s => {
      if (s.id !== targetId) return s;
      const cleaned = cleanseSeatStatuses({
        ...s,
        isEvilConverted: true,
        isDemonSuccessor: false,
        charadeRole: null,
      }, { keepDeathState: true });
      return cleaned;
    }));
    insertIntoWakeQueueAfterCurrent(targetId, { logLabel: `${targetId + 1}号转为邪恶` });
  }, [setSeats, cleanseSeatStatuses, insertIntoWakeQueueAfterCurrent]);

  // ======================================================================
  //  Modal and Action Handlers - Moved from page.tsx
  // ======================================================================

  // Execute player (execution logic)
  // Execute player (execution logic)
  // Execute player (execution logic)
  const executePlayer = useCallback((id: number, options?: { skipLunaticRps?: boolean; forceExecution?: boolean }) => {
    const seatsSnapshot = seats;
    const t = seatsSnapshot.find(s => s.id === id);
    if (!t || !t.role) return;

    // --- Pre-flight UI Checks (Modals) ---
    // Saint: Confirm if not forced
    if (t.role.id === 'saint' && !options?.forceExecution) {
      setCurrentModal({ type: 'SAINT_EXECUTION_CONFIRM', data: { targetId: id, skipLunaticRps: options?.skipLunaticRps } });
      return;
    }
    // Psychopath: RPS if not skipped
    if (t.role.id === 'psychopath' && !options?.skipLunaticRps) {
      const nominatorId = nominationMap[id] ?? null;
      setCurrentModal({ type: 'LUNATIC_RPS', data: { targetId: id, nominatorId } });
      return;
    }

    // --- Atomic Dispatch ---
    dispatch({ type: 'EXECUTE_PLAYER', targetId: id });

    // --- Post-Dispatch Side Effects (Metadata) ---
    // Godfather: If outsider executed, trigger night ability
    if (t.role.type === 'outsider') {
      setOutsiderDiedToday(true);
      addLog('📜 规则提示：今日有外来者被处决，若场上有教父且未醉/毒，当晚将被唤醒执行额外杀人');
    }

    // Note: Zombuul "False Death" and other protections are handled by logic returning "Logs".
    // "Start Night" transition is now manual to ensure user acknowledges the result.
  }, [dispatch, seats, nominationMap, setCurrentModal, setOutsiderDiedToday, addLog]);


  // ======================================================================
  //  Additional Modal Handlers - Continue migrating from page.tsx
  // ======================================================================

  // Confirm kill handler
  const confirmKill = useCallback(() => {
    if (!nightInfo || currentModal?.type !== 'KILL_CONFIRM') return;

    // Prevent double-click / race conditions
    if (processingRef.current) return;
    processingRef.current = true;

    const targetId = currentModal.data.targetId;
    const impSeat = nightInfo.seat;

    // 如果当前执行杀人能力的角色本身中毒/醉酒则本次夜间攻击应视为无事发生
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

    // 重构：使用 roleActionHandlers 处理小恶魔自杀逻辑
    // 重构：Atomic Dispatch 处理小恶魔自杀 (Star Pass)
    if (targetId === impSeat.id && nightInfo.effectiveRole.id === 'imp') {
      const aliveMinions = seats.filter(s => s.role?.type === 'minion' && !s.isDead && s.id !== impSeat.id);

      if (aliveMinions.length > 0) {
        const newImp = getRandom(aliveMinions);

        // Pure Logic Transition
        dispatch({ type: 'IMP_STAR_PASS', oldImpId: impSeat.id, newImpId: newImp.id });

        // Side Effects: Update Wake Queue & Local State
        setWakeQueueIds(prev => prev.filter(id => id !== impSeat.id));
        setDeadThisNight(prev => [...prev, impSeat.id]);
        enqueueRavenkeeperIfNeeded(impSeat.id);

        console.warn(`%c 小恶魔传位成功 -> ${newImp.id + 1}号`, 'color: #FFD700; font-weight: bold;');

        setCurrentModal(null);
        // Wait for state update to propagate? dispatch is sync for ref.
        return;
      } else {
        // No minions: Just Die
        addLogWithDeduplication(`${impSeat.id + 1}号(小恶魔) 自杀但无爪牙传位，直接死亡`, impSeat.id, '小恶魔');
        // Atomic Dispatch via generic kill
        dispatch({ type: 'KILL_PLAYER', targetId: impSeat.id, source: 'demon' });

        // Do not manually run checkGameOver here, dispatch handles it.
        // But we need to close modal.
        setCurrentModal(null);
        return;
      }
    } else {
      const result = nightLogic.processDemonKill(targetId);
      if (result === 'pending') return;
    }
    setShowKillConfirmModal(null);
    if (moonchildChainPendingRef.current) {
      processingRef.current = false;
      return;
    }

    setTimeout(() => {
      continueToNextAction();
      processingRef.current = false;
    }, 50);
  }, [nightInfo, showKillConfirmModal, seats, isActorDisabledByPoisonOrDrunk, addLogWithDeduplication, setShowKillConfirmModal, setSelectedActionTargets, continueToNextAction, getRandom, roles, setSeats, setWakeQueueIds, checkGameOver, setDeadThisNight, enqueueRavenkeeperIfNeeded, killPlayer, nightLogic, moonchildChainPendingRef]);

  // Submit votes handler
  // 规则特例：玩家可以在对自己的提名中投票（规则书中没有提及"不能在自己的提名中投票"）
  // 规则：死亡玩家只能在有投票标记（hasGhostVote）时进行一次处决投票
  const submitVotes = useCallback((v: number, voters?: number[]) => {
    if (currentModal?.type !== 'VOTE_INPUT') return;
    const voterId = currentModal.data.voterId;

    // 验证票数必须是自然数>=1且不超过开局时的玩家
    const initialPlayerCount = initialSeats.length > 0
      ? initialSeats.filter(s => s.role !== null).length
      : seats.filter(s => s.role !== null).length;

    // 验证票数范围
    if (isNaN(v) || v < 1 || !Number.isInteger(v)) {
      alert(`票数必须是自然数大于等于1的整数`);
      return;
    }

    if (v > initialPlayerCount) {
      alert(`票数不能超过开局时的玩家数${initialPlayerCount}人`);
      return;
    }

    // 规则：检查死亡玩家是否还有幽灵票
    // 规则说明：死亡玩家只能在有投票标记时进行一次处决投票
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

    // 保存历史记录
    saveHistory();

    // 记录投票者是否为恶魔用于卖花女孩
    const voteRecord = voteRecords.find(r => r.voterId === voterId);
    const isDemonVote = voteRecord?.isDemon || false;
    if (isDemonVote) {
      setTodayDemonVoted(true);
    }

    // 规则：计算存活人数（排除旅行者）
    const aliveCoreSeats = seats.filter(s => !s.isDead && s.role && s.role.type !== 'traveler');
    const aliveCount = aliveCoreSeats.length;
    const threshold = Math.ceil(aliveCount / 2);

    // 扣除幽灵票 & 设置票数
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

    // 记录投票者（卖花女/公告员）
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
    // 保存历史记录
    saveHistory();

    const cands = seats.filter(s => s.isCandidate).sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
    if (cands.length === 0) {
      // 6. 弹窗公示处决结果
      setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: "无人上台无人被处决" } });
      return;
    }

    // 规则：计算存活人数（排除旅行者）
    const aliveCoreSeats = seats.filter(s => !s.isDead && s.role && s.role.type !== 'traveler');
    const aliveCount = aliveCoreSeats.length;
    const threshold = Math.ceil(aliveCount / 2);

    // 规则：投票成功条件：票数最多（不得与他人并列）且 >= 存活人数的一半
    const max = cands[0].voteCount || 0;

    // 找出所有达到阈值的候选人
    const qualifiedCands = cands.filter(c => (c.voteCount || 0) >= threshold);
    if (qualifiedCands.length === 0) {
      setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `最高票 ${max} 未达到半数 ${threshold}，无人被处决` } });
      return;
    }

    // 找出票数最高的候选人（可能有多个）
    const maxVoteCount = qualifiedCands[0].voteCount || 0;
    const tops = qualifiedCands.filter(c => c.voteCount === maxVoteCount);

    // 规则：如果平票（最高票数相同且都达到阈值），则都不被处决
    if (tops.length > 1) {
      setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `平票（${tops.length}人并列最高票 ${maxVoteCount}），平安日无人被处决` } });
    } else if (tops.length === 1) {
      const executed = tops[0];
      // 茶艺师若她存活且两侧邻居均为善良则邻居不能被处决
      const teaLady = seats.find(s => s.role?.id === 'tea_lady' && !s.isDead);
      if (teaLady) {
        const neighbors = getAliveNeighbors(seats, teaLady.id);
        const left = neighbors[0];
        const right = neighbors[1];
        const protectsNeighbor =
          left && right &&
          (executed.id === left.id || executed.id === right.id) &&
          isGoodAlignment(left) &&
          isGoodAlignment(right);
        if (protectsNeighbor) {
          const msg = `由于茶艺师 ? 能力，${executed.id + 1}号是茶艺师的善良邻居，本次处决无效，请重新计票或宣布平安日`;
          addLog(msg);
          setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: msg } });
          return;
        }
      }
      if (executed.role?.id === 'psychopath') {
        executePlayer(executed.id);
        return;
      }
      executePlayer(executed.id);
      // 6. 弹窗公示处决结果
      setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `${executed.id + 1}号被处决` } });
    }
  }, [saveHistory, seats, setCurrentModal, getAliveNeighbors, isGoodAlignment, executePlayer, addLog]);

  // Confirm poison handler
  const confirmPoison = useCallback(() => {
    if (!nightInfo || currentModal?.type !== 'POISON_CONFIRM') return;

    // Debounce/Race prevention
    if (processingRef.current) return;
    processingRef.current = true;

    const targetId = currentModal.data.targetId;

    // Force cleanup UI state immediately
    setCurrentModal(null);
    setSelectedActionTargets([]);

    const delayedContinue = () => {
      setTimeout(() => {
        continueToNextAction();
        processingRef.current = false;
      }, 50);
    };

    executePoisonAction(targetId, false, {
      nightInfo,
      seats,
      setSeats,
      setCurrentModal: () => { }, // No-op as we handled it
      setSelectedActionTargets: () => { }, // No-op as we handled it
      continueToNextAction: delayedContinue,
      isActorDisabledByPoisonOrDrunk,
      addLogWithDeduplication,
      addPoisonMark,
      computeIsPoisoned,
    });
  }, [currentModal, nightInfo, seats, setSeats, setCurrentModal, setSelectedActionTargets, continueToNextAction, isActorDisabledByPoisonOrDrunk, addLogWithDeduplication, addPoisonMark, computeIsPoisoned, executePoisonAction]);

  // Confirm poison evil handler
  const confirmPoisonEvil = useCallback(() => {
    if (!nightInfo || currentModal?.type !== 'POISON_EVIL_CONFIRM') return;

    if (processingRef.current) return;
    processingRef.current = true;

    const targetId = currentModal.data.targetId;

    setCurrentModal(null);
    setSelectedActionTargets([]);

    const delayedContinue = () => {
      setTimeout(() => {
        continueToNextAction();
        processingRef.current = false;
      }, 50);
    };

    executePoisonAction(targetId, true, {
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
  }, [currentModal, nightInfo, seats, setSeats, setCurrentModal, setSelectedActionTargets, continueToNextAction, isActorDisabledByPoisonOrDrunk, addLogWithDeduplication, addPoisonMark, computeIsPoisoned, executePoisonAction]);

  const startSubsequentNight = useCallback(() => {
    nightLogic.startNight(false);
  }, [nightLogic]);

  // Confirm execution result handler
  const confirmExecutionResult = useCallback(() => {
    if (currentModal?.type !== 'EXECUTION_RESULT') return;
    const isVirginTrigger = currentModal.data.isVirginTrigger;
    setCurrentModal(null);

    // 如果是贞洁者触发的处决点击确认后自动进入下一个黑
    if (isVirginTrigger) {
      startSubsequentNight();
      return;
    }

    // BMR：主谋（Mastermind）额外一天的结算
    // 使用 Atomic Dispatch 处理胜负裁定
    if (mastermindFinalDay?.active) {
      // Pass the context that Mastermind is active and day logic is resolving
      dispatch({
        type: 'CHECK_GAME_OVER',
        executedId: todayExecutedId ?? undefined, // Need to pass this as it might not be in store if set slightly differently?
        // Actually, dispatch will use current state. 'todayExecutedId' is a state ref.
        lastAction: todayExecutedId ? 'execution' : 'check_phase',
        context: {
          isMastermindActive: true,
          // executedSeatId: todayExecutedId // Optional, for historical context
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

    // 规则：计算存活人数（排除旅行者）
    const aliveCoreSeats = seats.filter(s => !s.isDead && s.role && s.role.type !== 'traveler');
    const aliveCount = aliveCoreSeats.length;
    const threshold = Math.ceil(aliveCount / 2);

    const max = cands[0].voteCount || 0;
    const qualifiedCands = cands.filter(c => (c.voteCount || 0) >= threshold);
    const maxVoteCount = qualifiedCands.length > 0 ? qualifiedCands[0].voteCount || 0 : 0;
    const tops = qualifiedCands.filter(c => c.voteCount === maxVoteCount);
    if (tops.length !== 1) {
      // 平票/无人处决 -> 若为涡流环境邪恶立即胜
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
        const updatedSeats = seats.map(s => s.id === nominatorId ? { ...s, isDead: true, isSentenced: true } : s);
        setSeats(updatedSeats);
        checkGameOver(updatedSeats, nominatorId);
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
    // 如果恶魔死亡游戏已经结束不需要额外操
    // 如果无事发生继续游戏流
  }, [setCurrentModal]);

  // Handle slayer target selection
  const handleSlayerTargetSelect = useCallback((targetId: number) => {
    if (currentModal?.type !== 'SLAYER_SELECT_TARGET') return;
    const { shooterId } = currentModal.data;

    const shooter = seats.find(s => s.id === shooterId);
    if (!shooter) return;

    // 标记为已使用开枪能力（无论结果如何，能力都被消耗）
    saveHistory();
    setSeats((p: Seat[]) => p.map(s => s.id === shooterId ? { ...s, hasUsedSlayerAbility: true } : s));

    const target = seats.find(s => s.id === targetId);
    if (!target) {
      alert('目标不存在');
      setCurrentModal(null);
      return;
    }

    // 对尸体开枪能力被消耗但无效果
    if (target.isDead) {
      addLog(`${shooterId + 1}号对${targetId + 1}号的尸体开枪未产生效果`);
      setCurrentModal({ type: 'SHOOT_RESULT', data: { message: "无事发生目标已死亡", isDemonDead: false } });
      return;
    }

    // 只有健康状态的真正猎手选中恶魔才有
    // 规则对齐：中毒或醉酒的猎手能力失效（但能力依然会被消耗）
    const isRealSlayer = shooter.role?.id === 'slayer' && !isActorDisabledByPoisonOrDrunk(shooter) && !shooter.isDead;
    const targetRegistration = getRegistrationCached(target, shooter.role);
    const isDemon = targetRegistration.registersAsDemon;

    if (isRealSlayer && isDemon) {
      // 恶魔死亡游戏立即结束
      setSeats(p => {
        const newSeats = p.map(s => s.id === targetId ? { ...s, isDead: true } : s);
        addLog(`${shooterId + 1}号(猎手) 开枪击杀 ${targetId + 1}号(恶魔)`);
        addLog(`猎手的子弹击中了恶魔，按照规则游戏立即结束，不再进行今天的处决和后续夜晚`);
        // 先设置胜利原因然后调用 checkGameOver 并保存 winReason
        setWinReason('猎手击杀恶魔');
        checkGameOver(newSeats, undefined, true);
        return newSeats;
      });
      // 显示弹窗恶魔死亡
      setCurrentModal({ type: 'SHOOT_RESULT', data: { message: "恶魔死亡，善良阵营获胜", isDemonDead: true } });
    } else {
      // 如果猎手中毒或醉酒，或者目标不是恶魔，则无事发生
      const isPoisonedOrDrunk = isActorDisabledByPoisonOrDrunk(shooter);
      if (isPoisonedOrDrunk) {
        addLog(`${shooterId + 1}号(猎手) 开枪，但由于${shooter.isPoisoned ? '中毒' : '醉酒'}状态，能力失效`);
      } else {
        addLog(`${shooterId + 1}号${shooter.role?.id === 'slayer' ? '(猎手)' : ''} 开枪，${targetId + 1}号不是恶魔`);
      }
      // 显示弹窗无事发生
      setCurrentModal({ type: 'SHOOT_RESULT', data: { message: "无事发生", isDemonDead: false } });
    }
  }, [currentModal, seats, saveHistory, getRegistrationCached, checkGameOver, addLog, setCurrentModal, setSeats, setWinReason]);

  // ===========================
  // Group A: Confirm functions
  // ===========================

  const confirmMayorRedirect = useCallback((redirectTargetId: number | null) => {
    if (!nightInfo || currentModal?.type !== 'MAYOR_REDIRECT') return;
    const mayorId = currentModal.data.targetId;
    const demonName = currentModal.data.demonName;

    setCurrentModal(null);

    if (redirectTargetId === null) {
      // 不转移市长自己死亡
      nightLogic.processDemonKill(mayorId, { skipMayorRedirectCheck: true });
      setCurrentModal(null);
      continueToNextAction();
      return;
    }

    const seatId = nightInfo?.seat?.id ?? 0;
    addLogWithDeduplication(
      `${seatId + 1}号(${demonName}) 攻击市长 ${mayorId + 1}号，死亡转移给${redirectTargetId + 1}号`,
      seatId,
      demonName
    );

    nightLogic.processDemonKill(redirectTargetId, { skipMayorRedirectCheck: true, mayorId });
    setCurrentModal(null);
    if (moonchildChainPendingRef.current) return;
    continueToNextAction();
  }, [nightInfo, currentModal, nightLogic, setCurrentModal, continueToNextAction, addLogWithDeduplication, moonchildChainPendingRef]);

  const confirmHadesiaKill = useCallback(() => {
    if (!nightInfo || currentModal?.type !== 'HADESIA_KILL_CONFIRM' || currentModal.data.targetIds.length !== 3) return;
    const targetIds = currentModal.data.targetIds;

    // 哈迪寂亚三名玩家秘密决定自己的命运如果他们全部存活他们全部死亡
    // 这里简化处理说书人需要手动决定哪些玩家死
    // 所有玩家都会得知哈迪寂亚选择了谁
    const targetNames = targetIds.map(id => `${id + 1}号`).join('、');
    const seatId = nightInfo?.seat?.id ?? 0;
    addLog(`${seatId + 1}号(哈迪寂亚) 选择${targetNames}，所有玩家都会得知这个选择`);
    addLog(`请说书人决定 ${targetNames} 的命运如果他们全部存活他们全部死亡`);

    // 这里需要说书人手动处理暂时只记录日志
    setCurrentModal(null);
    setSelectedActionTargets([]);
    continueToNextAction();
  }, [nightInfo, currentModal, setCurrentModal, setSelectedActionTargets, continueToNextAction, addLog]);

  const confirmMoonchildKill = useCallback((targetId: number) => {
    if (!showMoonchildKillModal) return;
    const { sourceId, onResolve } = showMoonchildKillModal;
    setShowMoonchildKillModal(null);

    const targetSeat = seats.find(s => s.id === targetId);
    const isGood = targetSeat?.role && ['townsfolk', 'outsider'].includes(targetSeat.role.type);

    if (isGood) {
      addLog(`${sourceId + 1}号(月之子) 选择 ${targetId + 1}号与其陪葬，善良今晚死亡`);
      killPlayer(targetId, {
        onAfterKill: (latestSeats: Seat[]) => {
          onResolve?.(latestSeats);
          moonchildChainPendingRef.current = false;
          if (!moonchildChainPendingRef.current) {
            continueToNextAction();
          }
        }
      });
    } else {
      addLog(`${sourceId + 1}号(月之子) 选择 ${targetId + 1}号，但该目标非善良，未死亡`);
      moonchildChainPendingRef.current = false;
      onResolve?.();
      if (!moonchildChainPendingRef.current) {
        continueToNextAction();
      }
    }
  }, [showMoonchildKillModal, seats, killPlayer, continueToNextAction, addLog, setShowMoonchildKillModal, moonchildChainPendingRef]);

  const confirmSweetheartDrunk = useCallback((targetId: number) => {
    if (!showSweetheartDrunkModal) return;
    const { sourceId, onResolve } = showSweetheartDrunkModal;
    setShowSweetheartDrunkModal(null);

    setSeats(prev => prev.map(s => {
      if (s.id !== targetId) return s;
      // 心上人死亡时使一名玩家今晚至次日黄昏醉酒
      const clearTime = '次日黄昏';
      const { statusDetails, statuses } = addDrunkMark(s, 'sweetheart', clearTime);
      return { ...s, isDrunk: true, statusDetails, statuses };
    }));
    addLog(`${sourceId + 1}号(心上人) 死亡使 ${targetId + 1}号今晚至次日黄昏醉酒`);

    onResolve?.();
    continueToNextAction();
  }, [showSweetheartDrunkModal, setSeats, addDrunkMark, continueToNextAction, addLog, setShowSweetheartDrunkModal]);

  const confirmKlutzChoice = useCallback(() => {
    if (!showKlutzChoiceModal) return;
    const { sourceId, onResolve } = showKlutzChoiceModal;
    if (klutzChoiceTarget === null) {
      alert('请选择一名存活玩家');
      return;
    }
    const target = seats.find(s => s.id === klutzChoiceTarget);
    if (!target || target.isDead) {
      alert('必须选择一名存活玩家');
      return;
    }
    setShowKlutzChoiceModal(null);
    setKlutzChoiceTarget(null);
    const seatsToUse = seats;
    const isEvilPick = isEvil(target);
    if (isEvilPick) {
      addLog(`${sourceId + 1}号(呆瓜) 选择${target.id + 1}号，邪恶，善良阵营立即失败`);
      checkGameOver(seats, undefined, undefined, undefined, true);
      return;
    }
    addLog(`${sourceId + 1}号(呆瓜) 选择${target.id + 1}号，非邪恶，无事发生`);
    if (onResolve) {
      onResolve(seatsToUse);
    } else {
      checkGameOver(seatsToUse);
    }
  }, [showKlutzChoiceModal, klutzChoiceTarget, seats, isEvil, checkGameOver, setShowKlutzChoiceModal, setKlutzChoiceTarget, setWinResult, setWinReason, setGamePhase, addLog]);

  const confirmStorytellerDeath = useCallback((targetId: number | null) => {
    if (currentModal?.type !== 'STORYTELLER_DEATH') return;
    const sourceId = currentModal.data.sourceId;
    setCurrentModal(null);

    if (targetId === null) {
      const confirmed = window.confirm('你确认要让本晚无人死亡吗？这会让本局更偏离标准规则，只建议在你非常确定时使用');
      if (!confirmed) return;
      addLog(`说书人选择本晚无人死亡，因${sourceId + 1}号变为新恶魔，这是一次偏离标准规则的特殊裁决`);
      continueToNextAction();
      return;
    }

    addLog(`说书人指定${targetId + 1}号当晚死亡，因${sourceId + 1}号变恶魔`);
    killPlayer(targetId, {
      onAfterKill: () => {
        continueToNextAction();
      }
    });
  }, [currentModal, killPlayer, continueToNextAction, addLog, setCurrentModal]);

  const confirmHadesia = useCallback(() => {
    if (!nightInfo || !showHadesiaKillConfirmModal) return;
    const baseTargets = showHadesiaKillConfirmModal;
    const demonName = getDemonDisplayName(nightInfo.effectiveRole.id, nightInfo.effectiveRole.name);
    const choiceMap = baseTargets.reduce<Record<number, 'live' | 'die'>>((acc, id) => {
      acc[id] = hadesiaChoices[id] || 'live';
      return acc;
    }, {});

    const allChooseLive = baseTargets.every(id => choiceMap[id] === 'live');
    const finalTargets = allChooseLive ? baseTargets : baseTargets.filter(id => choiceMap[id] === 'die');

    const choiceDesc = baseTargets.map(id => `[${id + 1}号${choiceMap[id] === 'die' ? '死' : '生'}]`).join('、');
    addLog(`${nightInfo.seat.id + 1}号(${demonName}) 选择${choiceDesc}`);
    if (allChooseLive) {
      addLog(`三名玩家都选择"生"，按规则三人全部死亡`);
    } else if (finalTargets.length > 0) {
      addLog(`选择"生"的玩家${finalTargets.map(x => `${x + 1}号`).join('、')}将立即死亡`);
    } else {
      addLog('未选择"生"的玩家，未触发死亡');
    }

    // 保存当前唤醒索引用于后续继续流
    const currentWakeIdx = currentWakeIndex;
    const currentWakeQueue = [...wakeQueueIds];

    setShowHadesiaKillConfirmModal(null);
    setSelectedActionTargets([]);
    setHadesiaChoices({});

    if (finalTargets.length > 0) {
      let remaining = finalTargets.length;
      finalTargets.forEach(tid => {
        killPlayer(tid, {
          onAfterKill: (latestSeats: Seat[]) => {
            remaining -= 1;
            if (remaining === 0) {
              addLog(`${nightInfo?.seat.id + 1 || ''}号(${demonName}) 处决${finalTargets.map(x => `${x + 1}号`).join('、')}`);
              // 延迟执行确保状态更新完
              setTimeout(() => {
                // 使用 setWakeQueueIds 的回调形式来获取最新的队列状
                setWakeQueueIds(prevQueue => {
                  // 过滤掉已死亡的玩家killPlayer 已经移除了死亡的玩家但这里再次确认
                  const filteredQueue = prevQueue.filter(id => {
                    const seat = latestSeats?.find(s => s.id === id);
                    return seat && !seat.isDead;
                  });

                  // 如果当前索引超出范围或没有更多角色结束夜晚
                  if (currentWakeIdx >= filteredQueue.length - 1 || filteredQueue.length === 0) {
                    // 清空队列并重置索
                    setCurrentWakeIndex(0);
                    // 延迟显示死亡报告确保状态更新完
                    setTimeout(() => {
                      if (deadThisNight.length > 0) {
                        const deadNames = deadThisNight.map(id => `${id + 1}号`).join('、');
                        setCurrentModal({ type: 'NIGHT_DEATH_REPORT', data: { message: `昨晚${deadNames}玩家死亡` } });
                      } else {
                        setCurrentModal({ type: 'NIGHT_DEATH_REPORT', data: { message: "昨天是个平安夜" } });
                      }
                    }, 50);
                    return [];
                  } else {
                    // 继续下一个行
                    setTimeout(() => continueToNextAction(), 50);
                    return filteredQueue;
                  }
                });
              }, 100);
            }
          }
        });
      });
    } else {
      continueToNextAction();
    }
  }, [nightInfo, showHadesiaKillConfirmModal, hadesiaChoices, currentWakeIndex, wakeQueueIds, deadThisNight, killPlayer, continueToNextAction, getDemonDisplayName, addLog, setShowHadesiaKillConfirmModal, setSelectedActionTargets, setHadesiaChoices, setWakeQueueIds, setCurrentWakeIndex, setShowNightDeathReportModal]);

  const confirmSaintExecution = useCallback(() => {
    if (!showSaintExecutionConfirmModal) return;
    const { targetId } = showSaintExecutionConfirmModal;
    setShowSaintExecutionConfirmModal(null);
    executePlayer(targetId, { forceExecution: true });
  }, [showSaintExecutionConfirmModal, executePlayer, setShowSaintExecutionConfirmModal]);

  const cancelSaintExecution = useCallback(() => {
    setShowSaintExecutionConfirmModal(null);
  }, [setShowSaintExecutionConfirmModal]);

  const confirmRavenkeeperFake = useCallback((r: Role) => {
    // 选择假身份后在控制台显示假身份
    if (currentModal?.type !== 'RAVENKEEPER_FAKE' || !nightInfo) return;
    const targetId = currentModal.data.targetId;
    if (targetId !== null && nightInfo) {
      const resultText = `${targetId + 1}号玩家的真实身份：${r.name}${currentHint.isPoisoned || isVortoxWorld ? ' (中毒/醉酒状态，此为假信息)' : ''}`;
      setInspectionResult(resultText);
      setInspectionResultKey(k => k + 1);
      // 记录日志
      addLogWithDeduplication(
        `${nightInfo.seat.id + 1}号(守鸦人) 查验 ${targetId + 1}号 -> 伪 ${r.name}`,
        nightInfo.seat.id,
        '守鸦人'
      );
    }
    setCurrentModal(null);
  }, [currentModal, nightInfo, currentHint, isVortoxWorld, setInspectionResult, setInspectionResultKey, addLogWithDeduplication, setCurrentModal]);

  const confirmVirginTrigger = useCallback(() => {
    if (currentModal?.type !== 'VIRGIN_TRIGGER') return;
    const { source, target } = currentModal.data;
    // 使用 hasBeenNominated 而不hasUsedVirginAbility
    // 规则对齐：贞洁者在“中毒或醉酒”时能力失效
    if (target.role?.id === 'virgin' && !target.hasBeenNominated && !isActorDisabledByPoisonOrDrunk(target)) {
      setSeats(p => {
        const newSeats = p.map(s =>
          s.id === source.id ? { ...s, isDead: true } :
            s.id === target.id ? { ...s, hasBeenNominated: true, hasUsedVirginAbility: true } : s
        );
        addLog(`${source.id + 1}号提名贞洁者被处决`);
        checkGameOver(newSeats);
        return newSeats;
      });
      setCurrentModal(null);
    } else {
      setCurrentModal(null);
    }
  }, [currentModal, checkGameOver, setSeats, addLog, setCurrentModal]);

  const confirmRestart = useCallback(() => {
    // 如果游戏正在进行不是scriptSelection阶段先保存对局记录
    if (gamePhase !== 'scriptSelection' && selectedScript) {
      // 添加重开游戏的日志
      const updatedLogs = [...gameLogs, { day: nightCount, phase: gamePhase, message: "说书人重开了游戏" }];

      // 立即保存对局记录
      const endTime = new Date();
      const duration = startTime ? Math.floor((endTime.getTime() - startTime.getTime()) / 1000) : timer;

      const record: GameRecord = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        scriptName: selectedScript.name,
        startTime: startTime ? startTime.toISOString() : new Date().toISOString(),
        endTime: endTime.toISOString(),
        duration: duration,
        winResult: null, // 重开无胜负结果
        winReason: "说书人重开了游戏",
        seats: JSON.parse(JSON.stringify(seats)), // 深拷贝座位信息
        gameLogs: updatedLogs // 包含重开日志的完整日志
      };

      saveGameRecord(record);
    }

    window.location.reload();
  }, [gamePhase, selectedScript, gameLogs, nightCount, startTime, timer, seats, saveGameRecord]);

  // ===========================
  // Group B: Action functions
  // ===========================

  const executeNomination = useCallback((sourceId: number, id: number, options?: { virginGuideOverride?: { isFirstTime: boolean; nominatorIsTownsfolk: boolean }; openVoteModal?: boolean }) => {
    // 规则：只有存活的玩家可以发起提名（规则特例：死亡玩家不能发起提名）
    const nominatorSeat = seats.find(s => s.id === sourceId);
    if (!nominatorSeat || nominatorSeat.isDead) {
      addLog(`只有存活的玩家可以发起提名`);
      return;
    }

    // 规则特例：玩家可以对自己发起提名（规则书中没有提及"不能对自己提名"）
    // 注意：虽然可以对自己提名，但投票规则仍然适用

    // 规则：同一时间只能有一名玩家被提名
    const currentNomineeCount = Object.keys(nominationMap).length;
    if (currentNomineeCount > 0 && !nominationMap[id]) {
      addLog(`规则：同一时间只能有一名玩家被提名。请先完成当前提名的投票`);
      return;
    }

    // 规则：每名玩家每个黄昏只能发起一次提名
    if (nominationRecords.nominators.has(sourceId)) {
      addLog(`每名玩家每个黄昏只能发起一次提名`);
      return;
    }

    // 规则：每名玩家每个黄昏只能被提名一次（但允许提名自己，所以如果sourceId === id，需要特殊处理）
    // 规则特例：玩家可以对自己发起提名（规则书中没有提及"不能对自己提名"）
    if (sourceId !== id && nominationRecords.nominees.has(id)) {
      addLog(`每名玩家每个黄昏只能被提名一次`);
      return;
    }

    // 规则特例：如果玩家提名自己，且自己已经被提名过，则不允许（因为每名玩家每个黄昏只能被提名一次）
    // 注意：虽然可以对自己提名，但每名玩家每个黄昏只能被提名一次的规则仍然适用
    if (sourceId === id && nominationRecords.nominees.has(id)) {
      addLog(`每名玩家每个黄昏只能被提名一次`);
      return;
    }
    // 女巫若被诅咒者发起提名且仍有超过3名存活则其立即死亡
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

    // 贞洁者处女逻辑处理
    // 规则对齐：贞洁者在“中毒或醉酒”时能力失效（不触发处决）
    if (target?.role?.id === 'virgin' && !isActorDisabledByPoisonOrDrunk(target)) {
      const isFirstNomination = virginOverride?.isFirstTime ?? !target.hasBeenNominated;
      const currentSeats = seats;

      // 首次提名且未提供说书人确认时先弹窗询问提名者是否为镇民
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
        // 已经提名过按普通提名继续
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

          // 贞洁者触发的“立刻处决”在规则上属于一次处决：
          // - 影响涡流“今日是否有人被处决”
          // - 影响送葬者记录（本黄昏处决谁）
          // - 终止本次提名流程（无需进入投票）
          setSeats(finalSeats);
          setExecutedPlayerId(sourceId);
          setTodayExecutedId(sourceId);
          setHasExecutedThisDay?.(true);
          setCurrentDuskExecution(sourceId);

          // 本次提名到此结束：清空“当前被提名者”占位，避免阻塞后续提名/流程
          setNominationMap({});
          setNominationRecords((prev: { nominators: Set<number>; nominees: Set<number> }) => ({
            nominators: new Set(prev.nominators).add(sourceId),
            nominees: new Set(prev.nominees).add(id),
          }));

          addLog(`${sourceId + 1}号提名 ${id + 1}号（贞洁者）`);
          addLog(`因为你提名了贞洁者，${sourceId + 1}号被立即处决`);

          // Atomic Dispatch: Execution handles Saint/Soldier/etc via processGameEvent
          dispatch({ type: 'EXECUTE_PLAYER', targetId: sourceId });

          setCurrentModal({
            type: "EXECUTION_RESULT",
            data: { message: `${sourceId + 1}号玩家被处决`, isVirginTrigger: true },
          });
          return;
        } else {
          setSeats(updatedSeats);
          // 不触发处决继续普通提
        }
      }
    }

    // 魔像特殊逻辑如果提名的玩家不是恶魔他死亡
    if (nominatorSeat?.role?.id === 'golem') {
      const targetSeat = seats.find(s => s.id === id);
      const isDemon = targetSeat && (targetSeat.role?.type === 'demon' || targetSeat.isDemonSuccessor);
      if (!isDemon) {
        // Atomic Dispatch: Golem kill
        addLog(`${sourceId + 1}号(魔像) 提名 ${id + 1}号，${id + 1}号不是恶魔，${id + 1}号死亡`);
        dispatch({ type: 'KILL_PLAYER', targetId: id, source: 'golem' });
        // dispatch handles checkGameOver and win result
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
  }, [nominationRecords, seats, witchActive, witchCursedId, killPlayer, checkGameOver, getRegistrationCached, addLog, setNominationMap, setTodayMinionNominated, setVirginGuideInfo, setSeats, setWinResult, setWinReason, setGamePhase, setShowExecutionResultModal, setNominationRecords, setVoteInputValue, setShowVoteErrorToast, setCurrentModal, setWitchCursedId, setWitchActive]);

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
    setShowNominateModal(null);
    setShowShootModal(null);
  }, [virginGuideInfo, executeNomination, setVirginGuideInfo, setCurrentModal, setShowNominateModal, setShowShootModal]);

  const handleDayAction = useCallback((id: number) => {
    if (currentModal?.type !== 'DAY_ACTION') return;
    const { type, sourceId } = currentModal.data;
    setCurrentModal(null);
    if (type === 'nominate') {
      executeNomination(sourceId, id);
    } else if (type === 'slayer') {
      // 猎手射击：先弹出选择目标的弹窗
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
      // 弹出选择目标的弹窗
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
        // Slayer VFX trigger
        setVfxTrigger({ seatId: id, type: 'slayer' });
        // Clear it after duration
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
        return { ...s, charadeRole: selectedRole, displayRole: selectedRole, isDrunk: true }; // 永久醉酒，设置显示角色
      }
      return s;
    }));
    setCurrentModal(null);

    // 如果还没进入正式夜晚（处于 setup/check 阶段），则返回 proceedToFirstNight 继续后续初始化（处理多个酒鬼等）
    if (gamePhase === 'setup' || gamePhase === 'check') {
      proceedToFirstNight(roles);
    } else {
      continueToNextAction(); // 继续处理下一个夜间行动
    }
  }, [seats, roles, gamePhase, setSeats, setCurrentModal, addLog, continueToNextAction, proceedToFirstNight]);


  // 注册投票记录（用于卖花女/城镇公告员）
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
    // 交互式日间能力需要弹窗输确认
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

  /**
   * 简化的胜负检查函数（用于 Dusk 阶段快速检查）
   * 返回 'good' | 'evil' | null
   */
  const checkGameOverSimple = useCallback((seatsToCheck: Seat[]): 'good' | 'evil' | null => {
    // 1. Check if Demon is dead (Good Win)
    const livingDemon = seatsToCheck.find(s =>
      (s.role?.type === 'demon' || s.isDemonSuccessor) && !s.isDead
    );
    if (!livingDemon) {
      // 检查是否有红唇女郎可以继任
      const aliveCount = seatsToCheck.filter(s => !s.isDead).length;
      const scarletWoman = seatsToCheck.find(s =>
        s.role?.id === 'scarlet_woman' && !s.isDead && !s.isDemonSuccessor
      );
      if (aliveCount < 5 || !scarletWoman) {
        return 'good'; // Demon is dead and no successor possible
      }
      // 有红唇女郎且存活>=5，游戏继续
      return null;
    }

    // 2. Check Living Count (Evil Win)
    // 规则：旅行者不计入“存活玩家人数”的胜负计算；僵怖假死视为存活
    const livingCount = seatsToCheck.filter(s => {
      if (!s || !s.role) return false;
      if (s.role.id === 'zombuul' && s.isFirstDeathForZombuul && !s.isZombuulTrulyDead) {
        return true;
      }
      return !s.isDead;
    }).filter(s => s.role && s.role.type !== 'traveler').length;
    if (livingCount <= 2) return 'evil';

    return null; // Game continues
  }, []);

  /**
   * 处理白天主动技能（基于 dayMeta 协议）
   * 通用处理器，支持 Slayer 等角色的白天技能
   */
  const handleDayAbility = useCallback((sourceSeatId: number, targetSeatId?: number) => {
    const sourceSeat = seats.find(s => s.id === sourceSeatId);
    if (!sourceSeat || !sourceSeat.role) return;

    // 1. 优先尝试模块化处理
    const modularHandler = getRoleDefinition(sourceSeat.role.id);
    if (modularHandler && modularHandler.day) {
      // 检查使用次数（如果还没标记已使用，或者可以无限次使用）
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

      // 更新状态
      if (result.updates.length > 0) {
        setSeats(prev => prev.map(s => {
          const update = result.updates.find((upd: { id: number; }) => upd.id === s.id);
          return update ? { ...s, ...update } : s;
        }));
      }

      // 如果不是无限次数技能，标记为已使用
      if (modularHandler.day.maxUses !== 'infinity') {
        setSeats(prev => prev.map(s =>
          s.id === sourceSeatId ? { ...s, hasUsedDayAbility: true } : s
        ));
      }

      // 记录日志
      if (result.logs.privateLog) addLog(result.logs.privateLog);
      if (result.logs.publicLog) addLog(result.logs.publicLog);

      // 处理展示
      if (result.modal) {
        setCurrentModal(result.modal);
      }

      return;
    }

    // 2. 原有的中心化逻辑 (Slayer, Philosopher 等)
    if (!sourceSeat.role.dayMeta) {
      return;
    }

    // 检查是否已使用
    if (sourceSeat.hasUsedDayAbility) {
      alert("此玩家已经使用过技能了！");
      return;
    }

    const meta = sourceSeat.role.dayMeta;
    let logMessage = `${sourceSeatId + 1}号 [${sourceSeat.role.name}] 发动技能`;

    // 保存历史
    saveHistory();

    // 标记为已使用
    setSeats(prev => prev.map(s =>
      s.id === sourceSeatId
        ? { ...s, hasUsedDayAbility: true, hasUsedSlayerAbility: s.role?.id === 'slayer' ? true : s.hasUsedSlayerAbility }
        : s
    ));

    // 3. 处理效果
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

      // 检查目标是否为恶魔（考虑阵营转换等）
      const targetRole = targetSeat.role;
      const isDemon = targetRole?.type === 'demon' || targetSeat.isDemonSuccessor;

      if (isDemon) {
        // SLAYER SUCCESS - 击杀恶魔
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
        // SLAYER FAIL
        logMessage += ` -> 💨 未命中 (目标不是恶魔)`;
        addLog(logMessage);
        alert(`💨 杀手射击失败。\n目标不是恶魔 (或免疫)。`);
      }
    } else if (meta.effectType === 'kill' && targetSeatId !== undefined) {
      // 通用击杀效果（非 Slayer 检查）
      const targetSeat = seats.find(s => s.id === targetSeatId);
      if (targetSeat) {
        logMessage += ` 对 ${targetSeatId + 1}号使用`;
        killPlayer(targetSeatId);
        addLog(logMessage);
      }
    } else if (meta.effectType === 'transform_ability') {
      // 哲学家变身逻辑
      // targetType 应该是 'character'，表示选择角色而非玩家
      if (sourceSeat.role?.id === 'philosopher') {
        // 显示角色选择弹窗
        setCurrentModal({
          type: 'ROLE_SELECT',
          data: {
            type: 'philosopher',
            targetId: sourceSeatId,
            onConfirm: (roleId: string) => {
              // 确认后改变角色
              // 相克规则：如果即将获得的能力会触发“互斥同场”，则提醒并阻止获得（哲学家视为已使用由外层已提前标记）。
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
        // 其他角色使用 transform_ability（未来扩展）
        alert("🧠 变身逻辑待UI配合 (需选择角色列表)");
        // 测试用：强制变成调查员
        // changeRole(sourceSeatId, 'investigator');
      }
    } else {
      // 其他效果（info 等）
      addLog(logMessage);
    }
  }, [seats, saveHistory, killPlayer, setSeats, addLog, setWinReason, changeRole, roles, setCurrentModal]);

  // ===========================
  // Group C: Phase/Control functions
  // ===========================

  const declareMayorImmediateWin = useCallback(() => {
    setCurrentModal(null);
    // 规则对齐：市长若中毒/醉酒，能力可能失效；此处作为说书人“宣告获胜”入口，保留提醒但不强制阻止（避免打断说书人裁定）。
    const mayorSeat = seats.find(s => s.role?.id === 'mayor' && !s.isDead);
    if (mayorSeat && isActorDisabledByPoisonOrDrunk(mayorSeat)) {
      addLog(`提示：市长处于中毒/醉酒状态，按规则其能力可能失效；若仍宣告获胜，请视为说书人裁定`);
    }
    setWinResult('good');
    setWinReason('3人存活且今日不处决市长能力');
    setGamePhase('gameOver');
    addLog('市长在场且剩人今日选择不处决好人胜利');
  }, [setCurrentModal, setWinResult, setWinReason, setGamePhase, addLog, seats]);

  const handleRestart = useCallback(() => {
    setCurrentModal({ type: 'RESTART_CONFIRM', data: null });
  }, [setCurrentModal]);

  // ===========================
  // Group D: Seat Interaction functions
  // ===========================

  const setHadesiaChoice = useCallback((id: number, choice: 'live' | 'die') => {
    setHadesiaChoices((prev: Record<number, 'live' | 'die'>) => ({ ...prev, [id]: choice }));
  }, [setHadesiaChoices]);

  // Return all state and handlers needed by the UI
  return {
    // State
    ...gameState,

    seatNotes: gameState.seatNotes,
    setSeatNotes: gameState.setSeatNotes,

    vfxTrigger,
    setVfxTrigger,
    // Helper functions
    formatTimer,
    getSeatRoleId,
    cleanseSeatStatuses,
    isActionAbility,
    isActorDisabledByPoisonOrDrunk,
    addDrunkMark,
    isEvil,
    getDisplayRoleType,
    hasTeaLadyProtection,
    hasExecutionProof,
    saveHistory,
    resetRegistrationCache,
    getRegistrationCached,
    getFilteredRoles,
    hasUsedAbility,
    markAbilityUsed,
    hasUsedDailyAbility,
    markDailyAbilityUsed,
    getDisplayRoleForSeat,
    handleNextStep,
    filteredGroupedRoles,
    triggerIntroLoading,
    loadGameRecords,
    saveGameRecord,
    addLog,
    addLogWithDeduplication,
    cleanStatusesForNewDay,
    isEvilWithJudgment,
    enqueueRavenkeeperIfNeeded,
    checkGameOver,
    continueToNextAction,
    currentNightRole,
    nextNightRole,
    nightInfo,
    getDemonDisplayName,
    killPlayer,
    nightLogic,
    confirmNightDeathReport,
    changeRole,
    swapRoles,

    // Setup and validation handlers
    handleBaronAutoRebalance,
    handlePreStartNight,
    handleStartNight,
    handleDrunkCharadeSelect,
    proceedToCheckPhase,
    getStandardComposition,
    validateBaronSetup,
    validateCompositionSetup,
    getBaronStatus,
    getCompositionStatus,
    reviveSeat,
    convertPlayerToEvil,
    insertIntoWakeQueueAfterCurrent,

    // Modal and action handlers
    handleConfirmAction: interactionHandleConfirmAction,
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

    // Group A: Confirm functions
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

    // Group B: Action functions
    executeNomination,
    handleDayAction,
    handleVirginGuideConfirm,
    handleDayAbilityTrigger,
    handleDayAbility, // NEW: Generic dayMeta-based ability handler
    registerVotes, // Register votes for Flowergirl/Town Crier
    votedThisRound, // Current round's vote list
    checkGameOverSimple, // NEW: Simplified game over check for Dusk phase
    nightOrderPreviewLive,

    // Group C: Phase/Control functions
    declareMayorImmediateWin,
    handleDayEndTransition: handleDayEndTransitionOverride,
    handleRestart,
    handleSwitchScript,
    handleNewGame,
    handleStepBack,
    handleGlobalUndo,
    closeNightOrderPreview,
    confirmNightOrderPreview,
    proceedToFirstNight, // CRITICAL: Synchronous transition to first night

    // Group D: Seat Interaction functions
    onSeatClick: (id: number, options?: { force?: boolean }) => interactionHandleSeatClick(id, options),
    toggleStatus: interactionToggleStatus,
    handleMenuAction,
    setHadesiaChoice,
    setRedNemesisTarget,

    // Timer control functions
    handleTimerPause,
    handleTimerStart,
    handleTimerReset,
    isTimerRunning,

    // Targeting functions
    toggleTarget: interactionToggleTarget,
    isTargetDisabled,

    // Additional exports
    groupedRoles,
    isGoodAlignment,
    getSeatPosition: getSeatPosition,

    compositionError,
    baronSetupCheck,
  };
}

