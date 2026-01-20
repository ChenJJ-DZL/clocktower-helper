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
import { getRoleConfirmHandler, handleImpSuicide, executePoisonAction, type RoleConfirmContext } from "./roleActionHandlers";
import { useExecutionHandler, type ExecutionHandlerContext } from "./useExecutionHandler";
import { useNightActionHandler, type NightActionHandlerContext } from "./useNightActionHandler";
import { ModalType } from "../types/modal";
import {
  getRandom,
  getRegistration,
  getRegisteredAlignment,
  computeIsPoisoned,
  addPoisonMark,
  isEvil,
  isGoodAlignment,
  getAliveNeighbors,
  shouldShowFakeInfo,
  getMisinformation,
  getSeatPosition,
  type RegistrationCacheOptions,
} from "../utils/gameRules";
import { calculateNightInfo, generateNightTimeline } from "../utils/nightLogic";
import { isAntagonismEnabled, checkCannotGainAbility, checkMutualExclusion } from "../utils/antagonism";

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

// 判断某个夜晚行动是否属于有效果的行动类能力杀死投毒/保护/标记等
const isActionAbility = (role?: Role | null): boolean => {
  if (!role) return false;
  const t = role.nightActionType;
  return t === 'kill' || t === 'poison' || t === 'protect' || t === 'mark' || t === 'kill_or_skip';
};

// 统一判断角色是否在本回合应视为能力失效中毒或醉酒
const isActorDisabledByPoisonOrDrunk = (seat: Seat | undefined, knownIsPoisoned?: boolean): boolean => {
  if (!seat) return !!knownIsPoisoned;
  const poisoned = knownIsPoisoned !== undefined ? knownIsPoisoned : computeIsPoisoned(seat);
  const drunk = seat.isDrunk || seat.role?.id === 'drunk';
  return poisoned || drunk;
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
  switch(drunkType) {
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

// 判断玩家在胜负条件计算中是否属于邪恶阵营仅计算爪牙和恶魔隐士永远属于善良阵营
const isEvilForWinCondition = (seat: Seat): boolean => {
  if (!seat.role) return false;
  if (seat.isGoodConverted) return false;
  return seat.isEvilConverted === true ||
         seat.role.type === 'demon' || 
         seat.role.type === 'minion' || 
         seat.isDemonSuccessor;
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
export function useGameController() {
  // Get all state from useGameState
  const gameState = useGameState();
  
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
    seats, setSeats,
    initialSeats, setInitialSeats,
    gamePhase, setGamePhase,
    selectedScript, setSelectedScript,
    nightCount, setNightCount,
    deadThisNight, setDeadThisNight,
    executedPlayerId, setExecutedPlayerId,
    gameLogs, setGameLogs,
    winResult, setWinResult,
    winReason, setWinReason,
    
    // 时间和UI状态
    startTime, setStartTime,
    timer, setTimer,
    selectedRole, setSelectedRole,
    contextMenu, setContextMenu,
    showMenu, setShowMenu,
    longPressingSeats, setLongPressingSeats,
    
    // 夜晚行动状态
    wakeQueueIds, setWakeQueueIds,
    currentWakeIndex, setCurrentWakeIndex,
    selectedActionTargets, setSelectedActionTargets,
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
    currentModal, setCurrentModal,
    
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
  } = gameState;

  // 相克规则（灯神在场时启用）
  // 说明：相克规则是规则而非能力；灯神只是允许说书人宣布这些规则。
  
  // 注意seatsRef 需要同步 seats 状态
  seatsRef.current = seats;

  // Get functions from useRoleAction
  const { executeAction, canSelectTarget: checkCanSelectTarget, getTargetCount: getRoleTargetCount } = useRoleAction();
  
  // Get functions from useExecutionHandler and useNightActionHandler
  const { handleExecution } = useExecutionHandler();
  const { handleNightAction } = useNightActionHandler();

  // 保存历史记录 - 改为普通函数使用ref避免Hook依赖问题
  const saveHistory = () => {
    const state = gameStateRef.current;
    setHistory(prev => [...prev, {
      seats: JSON.parse(JSON.stringify(state.seats)),
      gamePhase: state.gamePhase,
      nightCount: state.nightCount,
      executedPlayerId: state.executedPlayerId,
      wakeQueueIds: [...state.wakeQueueIds],
      currentWakeIndex: state.currentWakeIndex,
      selectedActionTargets: [...state.selectedActionTargets],
      gameLogs: [...state.gameLogs],
      currentHint: JSON.parse(JSON.stringify(currentHint)), // 保存当前 hint
      selectedScript: state.selectedScript // 保存选中的剧本
    }]);
  };

  const resetRegistrationCache = useCallback((key: string) => {
    registrationCacheRef.current = new Map();
    registrationCacheKeyRef.current = key;
  }, []);

  // ============================================================================
  // 关键：避免 “Cannot access 'killPlayer' before initialization”
  //
  // 说明：本文件内有不少 useCallback/useEffect 在 killPlayer 实现声明之前就引用了它。
  // 在 JS 中，const 变量在声明前处于 TDZ（Temporal Dead Zone），会导致运行时崩溃。
  //
  // 解决：提前声明一个稳定的 killPlayer wrapper（永远已初始化），内部通过 ref
  // 调用后面定义的真实实现 killPlayerImpl。
  // ============================================================================
  const killPlayerImplRef = useRef<
    ((targetId: number, options?: any) => void) | null
  >(null);

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
    setSeats(prev => prev.map(s => {
      if (s.id !== seatId) return s;
      const detail = '一次性能力已用';
      const statusDetails = s.statusDetails || [];
      return statusDetails.includes(detail)
        ? s
        : { ...s, statusDetails: [...statusDetails, detail] };
    }));
    setUsedOnceAbilities(prev => {
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
    setUsedDailyAbilities(prev => {
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
    return filtered.reduce((acc, role) => {
      if (!acc[role.type]) acc[role.type] = [];
      acc[role.type].push(role);
      return acc;
    }, {} as Record<string, Role[]>);
  }, [selectedScript, getFilteredRoles]);
  
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

  // 从localStorage读取对局记录
  const loadGameRecords = useCallback(() => {
    try {
      if (typeof window === 'undefined') return; // 服务器端不执行
      const stored = localStorage.getItem('clocktower_game_records');
      if (stored) {
        const records = JSON.parse(stored) as GameRecord[];
        setGameRecords(records);
      }
    } catch (error) {
      console.error('读取对局记录失败:', error);
    }
  }, []);

  // 保存对局记录到localStorage
  const saveGameRecord = useCallback((record: GameRecord) => {
    try {
      if (typeof window === 'undefined') return; // 服务器端不执行
      const stored = localStorage.getItem('clocktower_game_records');
      let records: GameRecord[] = stored ? JSON.parse(stored) : [];
      // 将新记录添加到开头
      records = [record, ...records];
      // 最多保留100条记录
      if (records.length > 100) {
        records = records.slice(0, 100);
      }
      localStorage.setItem('clocktower_game_records', JSON.stringify(records));
      setGameRecords(records);
    } catch (error) {
      console.error('保存对局记录失败:', error);
    }
  }, []);

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

  // ==========================================================================
  // CRITICAL: currentModal <-> legacy showXxxModal “同步器”
  //
  // 背景：
  // - 新的弹窗系统使用 `currentModal` 作为单一数据源
  // - 但 UI（`GameModals`）里仍有大量 legacy `showXxxModal` props（兼容期）
  // - 如果某个流程只 setCurrentModal 而 UI 仍读 legacy，就会出现“弹窗不显示/按钮被禁用/流程卡死”
  //
  // 目标：
  // - 让 currentModal 成为事实上的 source of truth
  // - 当 currentModal 改变时，自动把对应 legacy 状态同步出来
  // - 当 currentModal 关闭或切换到别的类型时，只清理“上一次由 currentModal 同步出来的那一种”legacy 状态
  //   （避免误伤仍由旧逻辑直接驱动的 legacy 弹窗）
  // ==========================================================================
  const lastSyncedModalTypeRef = useRef<NonNullable<ModalType>['type'] | null>(null);
  useEffect(() => {
    const prevType = lastSyncedModalTypeRef.current;
    const nextType = currentModal?.type ?? null;

    const clearLegacyFor = (type: NonNullable<ModalType>['type']) => {
      switch (type) {
        case 'KILL_CONFIRM':
          setShowKillConfirmModal(null);
          break;
        case 'POISON_CONFIRM':
          setShowPoisonConfirmModal(null);
          break;
        case 'POISON_EVIL_CONFIRM':
          setShowPoisonEvilConfirmModal(null);
          break;
        case 'NIGHT_DEATH_REPORT':
          setShowNightDeathReportModal(null);
          break;
        case 'HADESIA_KILL_CONFIRM':
          setShowHadesiaKillConfirmModal(null);
          break;
        case 'ATTACK_BLOCKED':
          setShowAttackBlockedModal(null);
          break;
        case 'MAYOR_REDIRECT':
          setShowMayorRedirectModal(null);
          break;
        case 'BARBER_SWAP':
          setShowBarberSwapModal(null);
          break;
        case 'PIT_HAG':
          setShowPitHagModal(null);
          break;
        case 'RANGER':
          setShowRangerModal(null);
          break;
        case 'DAMSEL_GUESS':
          setShowDamselGuessModal(null);
          break;
        case 'STORYTELLER_DEATH':
          setShowStorytellerDeathModal(null);
          break;
        case 'SWEETHEART_DRUNK':
          setShowSweetheartDrunkModal(null);
          break;
        case 'KLUTZ_CHOICE':
          setShowKlutzChoiceModal(null);
          break;
        case 'MOONCHILD_KILL':
          setShowMoonchildKillModal(null);
          break;
        case 'RAVENKEEPER_FAKE':
          setShowRavenkeeperFakeModal(null);
          break;
        case 'EXECUTION_RESULT':
          setShowExecutionResultModal(null);
          break;
        case 'SHOOT_RESULT':
          setShowShootResultModal(null);
          break;
        case 'VOTE_INPUT':
          setShowVoteInputModal(null);
          break;
        case 'DAY_ACTION':
          setShowDayActionModal(null);
          break;
        case 'DAY_ABILITY':
          setShowDayAbilityModal(null);
          break;
        case 'SAINT_EXECUTION_CONFIRM':
          setShowSaintExecutionConfirmModal(null);
          break;
        case 'LUNATIC_RPS':
          setShowLunaticRpsModal(null);
          break;
        case 'VIRGIN_TRIGGER':
          setShowVirginTriggerModal(null);
          break;
        case 'VIRGIN_GUIDE':
          setVirginGuideInfo(null);
          break;
        case 'DRUNK_CHARADE':
          setShowDrunkModal(null);
          break;
        case 'ROLE_SELECT':
          setShowRoleSelectModal(null);
          break;
        case 'MADNESS_CHECK':
          setShowMadnessCheckModal(null);
          break;
        case 'SHAMAN_CONVERT':
          setShowShamanConvertModal(false);
          break;
        case 'SPY_DISGUISE':
          setShowSpyDisguiseModal(false);
          break;
        case 'MAYOR_THREE_ALIVE':
          setShowMayorThreeAliveModal(false);
          break;
        case 'REVIEW':
          setShowReviewModal(false);
          break;
        case 'GAME_RECORDS':
          setShowGameRecordsModal(false);
          break;
        case 'ROLE_INFO':
          setShowRoleInfoModal(false);
          break;
        case 'RESTART_CONFIRM':
          setShowRestartConfirmModal(false);
          break;
        // 这些 modal 在 UI 里已经直接从 currentModal 读（或压根不是 legacy 形态），无需同步清理
        case 'NIGHT_ORDER_PREVIEW':
        case 'RANGER': // handled above
        case 'DAWN_REPORT':
        case 'GAME_OVER':
          break;
        default:
          break;
      }
    };

    const syncLegacyFromCurrentModal = (modal: NonNullable<ModalType>) => {
      switch (modal.type) {
        case 'KILL_CONFIRM':
          setShowKillConfirmModal(modal.data.targetId);
          break;
        case 'POISON_CONFIRM':
          setShowPoisonConfirmModal(modal.data.targetId);
          break;
        case 'POISON_EVIL_CONFIRM':
          setShowPoisonEvilConfirmModal(modal.data.targetId);
          break;
        case 'NIGHT_DEATH_REPORT':
          setShowNightDeathReportModal(modal.data.message);
          break;
        case 'HADESIA_KILL_CONFIRM':
          setShowHadesiaKillConfirmModal(modal.data.targetIds);
          break;
        case 'ATTACK_BLOCKED':
          setShowAttackBlockedModal(modal.data);
          break;
        case 'MAYOR_REDIRECT':
          setShowMayorRedirectModal(modal.data);
          break;
        case 'BARBER_SWAP':
          setShowBarberSwapModal(modal.data);
          break;
        case 'PIT_HAG':
          setShowPitHagModal(modal.data);
          break;
        case 'RANGER':
          setShowRangerModal(modal.data);
          break;
        case 'DAMSEL_GUESS':
          setShowDamselGuessModal(modal.data);
          break;
        case 'STORYTELLER_DEATH':
          setShowStorytellerDeathModal(modal.data);
          break;
        case 'SWEETHEART_DRUNK':
          setShowSweetheartDrunkModal(modal.data);
          break;
        case 'KLUTZ_CHOICE':
          setShowKlutzChoiceModal(modal.data);
          break;
        case 'MOONCHILD_KILL':
          setShowMoonchildKillModal(modal.data);
          break;
        case 'RAVENKEEPER_FAKE':
          setShowRavenkeeperFakeModal(modal.data.targetId);
          break;
        case 'EXECUTION_RESULT':
          setShowExecutionResultModal({ message: modal.data.message, isVirginTrigger: modal.data.isVirginTrigger });
          break;
        case 'SHOOT_RESULT':
          setShowShootResultModal({ message: modal.data.message, isDemonDead: modal.data.isDemonDead });
          break;
        case 'VOTE_INPUT':
          setShowVoteInputModal(modal.data.voterId);
          break;
        case 'DAY_ACTION':
          setShowDayActionModal(modal.data);
          break;
        case 'DAY_ABILITY':
          setShowDayAbilityModal(modal.data);
          break;
        case 'SAINT_EXECUTION_CONFIRM':
          setShowSaintExecutionConfirmModal({ targetId: modal.data.targetId });
          break;
        case 'LUNATIC_RPS':
          setShowLunaticRpsModal(modal.data);
          break;
        case 'VIRGIN_TRIGGER':
          setShowVirginTriggerModal(modal.data);
          break;
        case 'VIRGIN_GUIDE':
          setVirginGuideInfo(modal.data);
          break;
        case 'DRUNK_CHARADE':
          setShowDrunkModal(modal.data.seatId);
          break;
        case 'ROLE_SELECT':
          setShowRoleSelectModal(modal.data);
          break;
        case 'MADNESS_CHECK':
          setShowMadnessCheckModal(modal.data);
          break;
        case 'SHAMAN_CONVERT':
          setShowShamanConvertModal(true);
          break;
        case 'SPY_DISGUISE':
          setShowSpyDisguiseModal(true);
          break;
        case 'MAYOR_THREE_ALIVE':
          setShowMayorThreeAliveModal(true);
          break;
        case 'REVIEW':
          setShowReviewModal(true);
          break;
        case 'GAME_RECORDS':
          setShowGameRecordsModal(true);
          break;
        case 'ROLE_INFO':
          setShowRoleInfoModal(true);
          break;
        case 'RESTART_CONFIRM':
          setShowRestartConfirmModal(true);
          break;
        // 这些在 GameModals 里本就从 currentModal 读取（无需依赖 legacy）
        case 'NIGHT_ORDER_PREVIEW':
        case 'SHAMAN_CONVERT':
        case 'SPY_DISGUISE':
        case 'DAWN_REPORT':
        case 'GAME_OVER':
          break;
        default:
          break;
      }
    };

    // 1) 如果从一种 modal 切换到另一种 modal / 或关闭 modal，先清理上一种由 currentModal 同步出来的 legacy 状态
    if (prevType && prevType !== nextType) {
      clearLegacyFor(prevType);
    }

    // 2) 再同步当前 modal 对应的 legacy 状态
    if (currentModal) {
      syncLegacyFromCurrentModal(currentModal);
      lastSyncedModalTypeRef.current = currentModal.type;
      return;
    }

    lastSyncedModalTypeRef.current = null;
  }, [
    currentModal,
    setShowKillConfirmModal,
    setShowPoisonConfirmModal,
    setShowPoisonEvilConfirmModal,
    setShowNightDeathReportModal,
    setShowHadesiaKillConfirmModal,
    setShowAttackBlockedModal,
    setShowMayorRedirectModal,
    setShowBarberSwapModal,
    setShowPitHagModal,
    setShowRangerModal,
    setShowDamselGuessModal,
    setShowStorytellerDeathModal,
    setShowSweetheartDrunkModal,
    setShowKlutzChoiceModal,
    setShowMoonchildKillModal,
    setShowRavenkeeperFakeModal,
    setShowExecutionResultModal,
    setShowShootResultModal,
    setShowVoteInputModal,
    setShowDayActionModal,
    setShowDayAbilityModal,
    setShowSaintExecutionConfirmModal,
    setShowLunaticRpsModal,
    setShowVirginTriggerModal,
    setVirginGuideInfo,
    setShowDrunkModal,
    setShowRoleSelectModal,
    setShowMadnessCheckModal,
    setShowShamanConvertModal,
    setShowSpyDisguiseModal,
    setShowMayorThreeAliveModal,
    setShowReviewModal,
    setShowGameRecordsModal,
    setShowRoleInfoModal,
    setShowRestartConfirmModal,
  ]);

  // 更新ref
  useEffect(() => {
    gameStateRef.current = {
      seats,
      gamePhase,
      nightCount,
      executedPlayerId,
      wakeQueueIds,
      currentWakeIndex,
      selectedActionTargets,
      gameLogs,
      selectedScript
    };
  }, [seats, gamePhase, nightCount, executedPlayerId, wakeQueueIds, currentWakeIndex, selectedActionTargets, gameLogs, selectedScript]);

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

  // Timer running state
  const [isTimerRunning, setIsTimerRunning] = useState(true);

  useEffect(() => { 
    setTimer(0); 
    setIsTimerRunning(true); // Reset timer running state on phase change
  }, [gamePhase]);
  
  useEffect(() => { 
    if(!mounted || !isTimerRunning) return;
    const i = setInterval(() => setTimer(t => t + 1), 1000); 
    return () => clearInterval(i); 
  }, [mounted, isTimerRunning]);

  // Timer control functions
  const handleTimerPause = useCallback(() => {
    setIsTimerRunning(false);
  }, []);

  const handleTimerStart = useCallback(() => {
    setIsTimerRunning(true);
  }, []);

  const handleTimerReset = useCallback(() => {
    setTimer(0);
    setIsTimerRunning(true);
  }, [setTimer]);

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
  
  useEffect(() => { 
    seatsRef.current = seats; 
  }, [seats]);

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
    setBalloonistKnownTypes(prev => {
      const activeIds = new Set(seats.filter(s => s.role?.id === 'balloonist').map(s => s.id));
      const next: Record<number, string[]> = {};
      activeIds.forEach(id => {
        if (prev[id]) next[id] = prev[id];
      });
      return next;
    });
  }, [seats]);

  const addLog = useCallback((msg: string) => {
    setGameLogs(p => [...p, { day: nightCount, phase: gamePhase, message: msg }]);
  }, [nightCount, gamePhase]);

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
      setBalloonistCompletedIds(prev => [...prev, ...newlyCompleted]);
    }
  }, [balloonistKnownTypes, balloonistCompletedIds, addLog]);

  // 添加日志并去重每个玩家每晚只保留最后一次行动
  const addLogWithDeduplication = useCallback((msg: string, playerId?: number, roleName?: string) => {
    setGameLogs(prev => {
      // 如果提供了玩家ID和角色名先删除该玩家在该阶段之前的日志
      if (playerId !== undefined && roleName) {
        const filtered = prev.filter(log => 
          !(log.message.includes(`${playerId+1}号(${roleName})`) && log.phase === gamePhase)
        );
        return [...filtered, { day: nightCount, phase: gamePhase, message: msg }];
      }
      // 否则直接添加
      return [...prev, { day: nightCount, phase: gamePhase, message: msg }];
    });
  }, [nightCount, gamePhase]);

  const cleanStatusesForNewDay = useCallback(() => {
    setSeats(prev => prev.map(s => {
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
    setWakeQueueIds(prev => {
      if (prev.includes(targetId)) return prev;
      const insertionIndex = Math.min(currentWakeIndex + 1, prev.length);
      const next = [...prev];
      next.splice(insertionIndex, 0, targetId);
      return next;
    });
  }, [seats, currentWakeIndex]);

  // 计算 nightInfo - 必须在 useNightLogic 之前
  const nightInfo = useMemo(() => {
    if ((gamePhase === "firstNight" || gamePhase === "night") && wakeQueueIds.length > 0 && currentWakeIndex >= 0 && currentWakeIndex < wakeQueueIds.length) {
      return calculateNightInfo(
        selectedScript,
        seats,
        wakeQueueIds[currentWakeIndex],
        gamePhase,
        lastDuskExecution,
        fakeInspectionResultRef.current || undefined,
        drunkFirstInfoRef.current,
        isEvilWithJudgment,
        poppyGrowerDead,
        gameLogs,
        spyDisguiseMode,
        spyDisguiseProbability,
        deadThisNight,
        balloonistKnownTypes,
        addLog,
        registrationCacheRef.current,
        registrationCacheKeyRef.current || `${gamePhase}-${nightCount}`,
        isVortoxWorld,
        todayDemonVoted,
        todayMinionNominated,
        todayExecutedId,
        hasUsedAbility,
        votedThisRound, // NEW: Pass votedThisRound for Flowergirl/Town Crier
        outsiderDiedToday // NEW: Pass outsiderDiedToday for Godfather/Gossip
      );
    }
    return null;
  }, [selectedScript, seats, currentWakeIndex, gamePhase, wakeQueueIds, lastDuskExecution, isEvilWithJudgment, poppyGrowerDead, spyDisguiseMode, spyDisguiseProbability, deadThisNight, balloonistKnownTypes, addLog, nightCount, isVortoxWorld, todayDemonVoted, todayMinionNominated, todayExecutedId, hasUsedAbility, votedThisRound, outsiderDiedToday]);

  // 检查游戏结束条件
  const checkGameOver = useCallback((updatedSeats: Seat[], executedPlayerIdArg?: number | null, preserveWinReason?: boolean) => {
    // 防御性检查确保updatedSeats不为空且是有效数组
    if (!updatedSeats || updatedSeats.length === 0) {
      console.error('checkGameOver: updatedSeats为空或无效');
      return false;
    }
    
    // 计算存活人数：仅统计已分配角色的玩家
    // 僵怖假死状态 isFirstDeathForZombuul=true && !isZombuulTrulyDead 视为存活
    const aliveSeats = updatedSeats.filter(s => {
      if (!s || !s.role) return false;
      if (s.role.id === 'zombuul' && s.isFirstDeathForZombuul && !s.isZombuulTrulyDead) {
        return true;
      }
      return !s.isDead;
    });

    // 规则：旅行者不计入“存活玩家人数”的胜负计算
    const aliveCoreSeats = aliveSeats.filter(s => s.role && s.role.type !== 'traveler');
    const aliveCount = aliveCoreSeats.length;

    const executionTargetId = executedPlayerIdArg ?? executedPlayerId;
    
    // 优先检查镜像双子evil_twin 如果善良双子被处决邪恶阵营获胜
    if (executionTargetId !== null && executionTargetId !== undefined && evilTwinPair) {
      const executedPlayer = updatedSeats.find(s => s.id === executionTargetId);
      if (executedPlayer && executedPlayer.id === evilTwinPair.goodId) {
        setWinResult('evil');
        setWinReason('镜像双子善良双子被处决');
        setGamePhase('gameOver');
        addLog("游戏结束：镜像双子，善良双子被处决，邪恶阵营获胜");
        return true;
      }
    }
    
    // 优先检查圣徒被处决导致邪恶方获胜优先级高于恶魔死亡判定
    // 这个检查必须在恶魔死亡检查之前确保圣徒被处决的判定优先级更高
    if (executionTargetId !== null && executionTargetId !== undefined) {
      const executedPlayer = updatedSeats.find(s => s.id === executionTargetId);
      // 刚刚死于处决的圣徒立即触发邪恶获胜优先级最高
      const justExecutedSaint =
        executedPlayer &&
        executedPlayer.role?.id === 'saint' &&
        // 规则对齐：中毒或醉酒时，圣徒能力失效
        !isActorDisabledByPoisonOrDrunk(executedPlayer) &&
        executedPlayer.isDead;
      if (justExecutedSaint) {
        setWinResult('evil');
        setWinReason('圣徒被处决');
        setGamePhase('gameOver');
        addLog("游戏结束圣徒被处决邪恶阵营获胜");
        return true;
      }
    }
    
    // 检查是否有活着的恶魔包括原小恶魔小恶魔传位
    // 注意僵怖假死状态isFirstDeathForZombuul=true但isZombuulTrulyDead=false不算真正死亡
    const aliveDemon = updatedSeats.find(s => {
      if (s.role?.type !== 'demon' && !s.isDemonSuccessor) return false;
      // 僵怖特殊处理只有真正死亡isZombuulTrulyDead=true才算死亡
      if (s.role?.id === 'zombuul') {
        return !s.isZombuulTrulyDead;
      }
      return !s.isDead;
    });
    
    // 检查是否有死亡的恶魔包括原小恶魔小恶魔传位
    // 注意僵怖假死状态不算真正死亡
    const deadDemon = updatedSeats.find(s => {
      if (s.role?.type !== 'demon' && !s.isDemonSuccessor) return false;
      // 僵怖特殊处理只有真正死亡isZombuulTrulyDead=true才算死亡
      if (s.role?.id === 'zombuul') {
        return s.isZombuulTrulyDead === true;
      }
      return s.isDead;
    });
    
    // 检查镜像双子evil_twin 如果两个双子都存活善良阵营无法获胜
    if (evilTwinPair) {
      const evilTwin = updatedSeats.find(s => s.id === evilTwinPair.evilId);
      const goodTwin = updatedSeats.find(s => s.id === evilTwinPair.goodId);
      const bothAlive = evilTwin && !evilTwin.isDead && goodTwin && !goodTwin.isDead;
      if (bothAlive && deadDemon && !aliveDemon) {
        // 恶魔死亡但双子都存活善良无法获胜游戏继续
        addLog("镜像双子两个双子都存活善良阵营无法获胜游戏继续");
        return false;
      }
    }
    
    // 如果原小恶魔死亡但存在活着小恶魔传位游戏继续
    // 只有当所有恶魔包括"小恶魔传位"都死亡时好人才获胜
    const goodCoreWin =
      !!deadDemon && !aliveDemon;
    
    // 如果没有活着的恶魔检查是否有红唇女郎可以继任
    // 注意红唇女郎的变身逻辑主要在 executePlayer 中处理
    // 这里只是检查如果存活玩家数量 < 5 或没有红唇女郎判定好人胜利
    if (!aliveDemon) {
      const scarletWoman = updatedSeats.find(s => 
        s.role?.id === 'scarlet_woman' && !s.isDead && !s.isDemonSuccessor
      );
      // 如果存活玩家数量 < 5 或没有红唇女郎判定好人胜利
      if (aliveCount < 5 || !scarletWoman) {
        // 如果还没有由上方 deadDemon 分支判定好人胜，则在此视为核心好人胜利条件
        if (!goodCoreWin) {
          setWinResult('good');
          setWinReason('恶魔死亡');
          setGamePhase('gameOver');
          addLog("游戏结束恶魔死亡好人胜利");
          return true;
        }
      }
      // 如果存活玩家数量 >= 5 且有红唇女郎游戏继续红唇女郎的变身在 executePlayer 中处理
    }
    
    // 注意：市长“三活且当日不处决好人胜”属于“白天结束时的选择/流程”，
    // 不应在通用 checkGameOver 中任意时刻触发（否则白天任意一次死亡/检查都可能提前结束游戏）。
    // 该逻辑在 handleDayEndTransition -> MAYOR_THREE_ALIVE -> declareMayorImmediateWin 中处理。

    // ------------------------------------------------------------
    // 核心胜负条件：善良 vs 邪恶
    // 规则：若两个阵营同时满足胜利条件，则善良阵营获胜
    // ------------------------------------------------------------
    const evilCoreWin = aliveCount <= 2; // 旅行者不计入

    if (goodCoreWin) {
      // BMR：主谋（Mastermind）
      // 恶魔死亡后，若主谋存活且未中毒/醉酒，游戏继续进行“额外一天”。
      // 额外一天结束时：若无人处决 -> 邪恶获胜；否则 -> 善良获胜（恶魔已死）。
      const mastermind = updatedSeats.find(s => s.role?.id === 'mastermind' && !s.isDead);
      const mastermindActive = mastermind && !isActorDisabledByPoisonOrDrunk(mastermind);
      if (mastermindActive && !mastermindFinalDay?.active) {
        setMastermindFinalDay({ active: true, triggeredAtNight: nightCount });
        addLog('🧠 主谋在场：恶魔已死，但游戏继续进行额外一天（若该天无人处决则邪恶获胜）');
        return false;
      }

      // 所有恶魔均死亡（含传位） => 善良阵营胜利
      setWinResult('good');
      if (!preserveWinReason) {
        if (deadDemon?.isDemonSuccessor) {
          setWinReason('小恶魔传位死亡');
          addLog("游戏结束小恶魔传位死亡好人胜利");
        } else {
          setWinReason('小恶魔死亡');
          addLog("游戏结束：小恶魔死亡，好人胜利");
        }
      }
      setGamePhase('gameOver');
      return true;
    }

    if (evilCoreWin) {
      setWinResult('evil');
      setWinReason(`场上仅存${aliveCount}位存活玩家`);
      setGamePhase('gameOver');
      addLog(`游戏结束：场上仅存${aliveCount}位存活玩家，邪恶阵营获胜`);
      return true;
    }
    
    return false;
  }, [addLog, gamePhase, evilTwinPair, executedPlayerId, setWinResult, setWinReason, setGamePhase, mastermindFinalDay, setMastermindFinalDay, nightCount]);

  // 继续到下一个夜晚行动
  const continueToNextAction = useCallback(() => {
    // 保存历史记录
    saveHistory();
    
    // CRITICAL FIX: Handle empty wake queue (no roles to wake up)
    // If wakeQueueIds is empty, directly transition to day
    if (wakeQueueIds.length === 0) {
      console.log('[continueToNextAction] Empty wake queue, transitioning directly to day');
      // BMR：造谣者造谣为真 → 本夜额外死亡（说书人裁定）
      if (selectedScript?.id === 'bad_moon_rising' && gossipTrueTonight && gossipSourceSeatId !== null) {
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
              // 先关闭选择弹窗
              setCurrentModal(null);
              // 结算额外死亡（复用统一 killPlayer 逻辑）
              killPlayer(tid, {
                source: 'ability',
                recordNightDeath: true,
                onAfterKill: () => {
                  addLog(`🗣️ ${sourceId + 1}号(造谣者) 造谣为真：说书人裁定 ${tid + 1}号 额外死亡`);
                  setGossipTrueTonight(false);
                  setGossipSourceSeatId(null);
                  // 然后正常进入夜晚死亡报告
                  const merged = Array.from(new Set([...(deadThisNight || []), tid]));
                  const deadNames = merged.length > 0 ? merged.map(id => `${id + 1}号`).join('、') : '';
                  setCurrentModal({ type: 'NIGHT_DEATH_REPORT', data: { message: deadNames ? `昨晚${deadNames}玩家死亡` : "昨天是个平安夜" } });
                },
              });
            },
          },
        });
        return;
      }
      if(deadThisNight.length > 0) {
        const deadNames = deadThisNight.map(id => `${id+1}号`).join('、');
        setCurrentModal({ type: 'NIGHT_DEATH_REPORT', data: { message: `昨晚${deadNames}玩家死亡` } });
      } else {
        setCurrentModal({ type: 'NIGHT_DEATH_REPORT', data: { message: "昨天是个平安夜" } });
      }
      return;
    }
    
    // 检查是否有玩家在夜晚死亡需要跳过他们的环节但亡骨魔杀死的爪牙保留能力需要被唤醒
    const currentDead = seats.filter(s => {
      const roleId = getSeatRoleId(s);
      const diedTonight = deadThisNight.includes(s.id);
      if (roleId === 'ravenkeeper' && diedTonight) return false;
      return s.isDead && !s.hasAbilityEvenDead;
    });
    setWakeQueueIds(prev => prev.filter(id => !currentDead.find(d => d.id === id)));
    
    // 如果当前玩家已死亡且不保留能力跳过到下一个
    const currentId = wakeQueueIds[currentWakeIndex];
    const currentSeat = currentId !== undefined ? seats.find(s => s.id === currentId) : null;
    const currentRoleId = getSeatRoleId(currentSeat);
    const currentDiedTonight = currentSeat ? deadThisNight.includes(currentSeat.id) : false;
    if (currentId !== undefined && currentSeat?.isDead && !currentSeat.hasAbilityEvenDead && !(currentRoleId === 'ravenkeeper' && currentDiedTonight)) {
        setCurrentWakeIndex(p => p + 1);
        setInspectionResult(null);
        setSelectedActionTargets([]);
        fakeInspectionResultRef.current = null;
        return;
    }
    
    // 首晚恶魔行动后触发"爪牙认识恶魔"环节在控制台显示
    // 注意：这个模态框目前没有在GameModals中实现，所以暂时跳过，直接继续流程
    // TODO: 如果将来需要实现这个模态框，可以在这里添加逻辑
    if (gamePhase === 'firstNight' && nightInfo && nightInfo.effectiveRole.type === 'demon') {
      // 找到恶魔座位
      const demonSeat = seats.find(s => 
        (s.role?.type === 'demon' || s.isDemonSuccessor) && !s.isDead
      );
      // 找到所有爪牙
      const minionSeats = seats.filter(s => 
        s.role?.type === 'minion' && !s.isDead
      );
      
      // 如果有恶魔和爪牙且罂粟种植者不在场或已死亡触发"爪牙认识恶魔"环节
      if (demonSeat && minionSeats.length > 0) {
        const poppyGrower = seats.find(s => s.role?.id === 'poppy_grower');
        const shouldHideDemon = poppyGrower && !poppyGrower.isDead && poppyGrowerDead === false;
        
        if (!shouldHideDemon) {
          // 暂时只在控制台显示信息，不阻止流程继续
          // 如果将来需要模态框，可以在这里设置并return
          const minionNames = minionSeats.map(s => `${s.id + 1}号`).join('、');
          addLog(`👿 爪牙认识恶魔：${minionNames} 知道恶魔是 ${demonSeat.id + 1}号`);
          // 不return，继续推进步骤
          // setShowMinionKnowDemonModal({ demonSeatId: demonSeat.id });
          // return;
        }
      }
    }
    
    // CRITICAL FIX: Check if we're at the end of the night
    const isLastStep = currentWakeIndex >= wakeQueueIds.length - 1;
    
    if (!isLastStep) {
      // Normal progression to next step
      setCurrentWakeIndex(p => p + 1); 
      setInspectionResult(null);
      setSelectedActionTargets([]);
      fakeInspectionResultRef.current = null;
    } else {
      // 2. CRITICAL TRANSITION LOGIC - Force transition to day
      // Show death report first, then transition to day
      // The modal's onConfirm (confirmNightDeathReport) will handle the actual transition
      // BMR：造谣者造谣为真 → 本夜额外死亡（说书人裁定）
      if (selectedScript?.id === 'bad_moon_rising' && gossipTrueTonight && gossipSourceSeatId !== null) {
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
        return;
      }
      if(deadThisNight.length > 0) {
        const deadNames = deadThisNight.map(id => `${id+1}号`).join('、');
        setCurrentModal({ type: 'NIGHT_DEATH_REPORT', data: { message: `昨晚${deadNames}玩家死亡` } });
      } else {
        setCurrentModal({ type: 'NIGHT_DEATH_REPORT', data: { message: "昨天是个平安夜" } });
      }
      
      // Ensure we're still in night phase before transition (safety check)
      // The modal callback will handle the actual transition
    }
  }, [saveHistory, seats, deadThisNight, wakeQueueIds, currentWakeIndex, gamePhase, nightInfo, poppyGrowerDead, selectedScript, gossipTrueTonight, gossipSourceSeatId, gossipStatementToday, setGossipTrueTonight, setGossipSourceSeatId, setCurrentWakeIndex, setInspectionResult, setSelectedActionTargets, setWakeQueueIds, setCurrentModal, addLog, getSeatRoleId, killPlayer]);

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
        setCurrentHint(cachedHint);
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
          setBalloonistKnownTypes(prev => {
            const seatId = nightInfo?.seat?.id ?? 0;
            const known = prev[seatId] || [];
            if (known.includes(typeName)) return prev;
            return { ...prev, [seatId]: [...known, typeName] };
          });
        }
      }
      
      // 保存到缓存
      hintCacheRef.current.set(hintKey, newHint);
      setCurrentHint(newHint);
      
      if (selectedActionTargets.length > 0 && seats.find(s=>s.id===selectedActionTargets[0])?.id !== wakeQueueIds[currentWakeIndex]) {
        setSelectedActionTargets([]); 
        setInspectionResult(null);
        fakeInspectionResultRef.current = null;
      }
    }
  }, [currentWakeIndex, gamePhase, nightInfo, seats, selectedActionTargets, currentHint.fakeInspectionResult, addLogWithDeduplication]);

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
      setInspectionResult(`${prefix}${nightInfo.guide}`);
      setInspectionResultKey(k => k + 1);
    }
  }, [
    nightInfo,
    gamePhase,
    seats,
    getRoleTargetCount,
    isActorDisabledByPoisonOrDrunk,
    setInspectionResult,
    setInspectionResultKey,
  ]);

  // 安全兜底如果夜晚阶段存在叫醒队列但无法生成 nightInfo自动跳过当前环节或直接结束夜晚
  useEffect(() => {
    if (!(gamePhase === 'firstNight' || gamePhase === 'night')) return;
    if (wakeQueueIds.length === 0) return;
    // 只有在当前索引合法但 nightInfo 仍为 null 时才认为是异常卡住
    if (currentWakeIndex < 0 || currentWakeIndex >= wakeQueueIds.length) return;
    if (nightInfo) return;
    
    // 还有后续角色时直接跳到下一个夜晚行动
    if (currentWakeIndex < wakeQueueIds.length - 1) {
      continueToNextAction();
      return;
    }
    
    // 已经是最后一个角色且无法生成 nightInfo直接结束夜晚并进入天亮结算
    setWakeQueueIds([]);
    setCurrentWakeIndex(0);
    if (deadThisNight.length > 0) {
      const deadNames = deadThisNight.map(id => `${id + 1}号`).join('、');
      setCurrentModal({ type: 'NIGHT_DEATH_REPORT', data: { message: `昨晚${deadNames}玩家死亡` } });
    } else {
      setCurrentModal({ type: 'NIGHT_DEATH_REPORT', data: { message: "昨天是个平安夜" } });
    }
    setGamePhase('dawnReport');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamePhase, nightInfo, wakeQueueIds, currentWakeIndex]);

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

    const seatsSnapshot = seatsRef.current || seats;
    const minions = seatsSnapshot.filter(s => 
      s.role?.type === 'minion' && 
      !s.isDead && 
      s.id !== deadSeat.id // 不能传给自己
    );

    if (minions.length > 0) {
      // 有活着的爪牙，传位给第一个（实际游戏中应由说书人选择）
      // TODO: 未来可以添加 UI 让说书人选择传位目标
      const newDemonSeat = minions[0];
      
      alert(`😈 小恶魔死亡！传位给 ${newDemonSeat.id+1}号 [${newDemonSeat.role?.name || '未知'}]`);
      
      // 将爪牙变成 Imp
      const impRole = roles.find(r => r.id === 'imp');
      if (impRole) {
        setSeats(prev => prev.map(s => {
          if (s.id === newDemonSeat.id) {
            return {
              ...s,
              role: impRole,
              displayRole: impRole,
              isDemonSuccessor: true,
              statusDetails: [...(s.statusDetails || []), '恶魔传位'],
            };
          }
          return s;
        }));
        addLog(`😈 小恶魔传位：${newDemonSeat.id+1}号 [${newDemonSeat.role?.name}] 变成了小恶魔`);
      }
    } else {
      // 没有活着的爪牙，游戏结束（好人胜利）
      addLog(`😈 小恶魔死亡，且没有活着的爪牙可以接位，好人胜利`);
      // checkGameOver 会在 killPlayer 的 finalize 中调用，无需手动处理
    }
  }, [seats, roles, setSeats, addLog]);

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
  const killPlayerImpl = useCallback(
    (targetId: number, options: KillPlayerOptions & { source?: 'demon' | 'execution' | 'ability' } = {}) => {
      const seatsSnapshot = seatsRef.current || seats;
      const targetSeat = seatsSnapshot.find(s => s.id === targetId);
      if (!targetSeat) return;
      
      const {
        source = 'ability',
        recordNightDeath = true,
        keepInWakeQueue = false,
        seatTransformer,
        skipGameOverCheck,
        executedPlayerId = null,
        onAfterKill,
      } = options;
      
      const killerRoleId = nightInfo?.effectiveRole.id;

      // ======================================================================
      // BMR：水手（Sailor）—— 健康时不会死亡（适用于所有死亡来源）
      // 规则：水手中毒/醉酒时能力失效
      // ======================================================================
      if (targetSeat.role?.id === 'sailor') {
        const disabled = isActorDisabledByPoisonOrDrunk(targetSeat);
        if (!disabled) {
          addLog(`🍺 ${targetId + 1}号 [水手] 健康时不会死亡，免于死亡`);
          if (source === 'demon') {
            setShowAttackBlockedModal({
              targetId,
              reason: '水手免死',
              demonName: nightInfo ? getDemonDisplayName(nightInfo.effectiveRole.id, nightInfo.effectiveRole.name) : undefined,
            });
          }
          return;
        }
      }

      // ======================================================================
      // BMR：弄臣（Fool）首死免死 —— 适用于所有死亡来源
      // 规则：第一次将要死亡时不死亡；若弄臣中毒/醉酒则能力无效
      // 说明：放在“免疫/保护”之前，避免被后续逻辑改写；不影响刺客无视茶艺师（那是另一路保护逻辑）
      // ======================================================================
      if (targetSeat.role?.id === 'fool') {
        const alreadyTriggered = (targetSeat.statusDetails || []).some((d) => d.includes('弄臣免死已触发'));
        const disabled = isActorDisabledByPoisonOrDrunk(targetSeat);
        if (!alreadyTriggered && !disabled) {
          setSeats(prev => prev.map(s => {
            if (s.id !== targetId) return s;
            const details = Array.from(new Set([...(s.statusDetails || []), '弄臣免死已触发']));
            return { ...s, statusDetails: details };
          }));
          addLog(`🃏 ${targetId + 1}号 [弄臣] 第一次将要死亡，免于死亡`);
          if (source === 'demon') {
            setShowAttackBlockedModal({
              targetId,
              reason: '弄臣免死',
              demonName: nightInfo ? getDemonDisplayName(nightInfo.effectiveRole.id, nightInfo.effectiveRole.name) : undefined,
            });
          }
          return;
        }
      }

      // ======================================================================
      // 步骤 1: 检查是否已死
      // ======================================================================
      // 【小白模式】允许对已死玩家进行操作（用于手动修正错误，如重复击杀、鞭尸等）
      // 注释掉死亡检查，允许说书人自由操作
      // if (targetSeat.isDead) {
      //   // 如果已经死亡，直接返回（除非是特殊处理，如僵怖假死）
      //   if (targetSeat.role?.id !== 'zombuul' || targetSeat.isZombuulTrulyDead) {
      //     return;
      //   }
      // }
      
      // 【小白模式】如果目标已死，记录日志但不阻止操作
      // 规则特例：恶魔可以攻击一名已死亡的玩家（如果规则书中没有提及"不能攻击已死亡的玩家"）
      // 参考：官方规则细节说明 - "如果规则书中没有提及'你不能做某件事情'，那么你就可以做这件事情"
      if (targetSeat.isDead) {
        console.log(`[小白模式] 允许对已死玩家 ${targetId + 1}号 进行操作`);
        // 如果是僵怖假死状态，继续正常流程
        if (targetSeat.role?.id !== 'zombuul' || targetSeat.isZombuulTrulyDead) {
          // 不返回，允许继续操作（用于修正错误）
          // 规则特例：已死亡的玩家无法再次死亡，但如果能力允许，可以对其进行操作
        }
      }

      // ======================================================================
      // 步骤 2: 检查是否免疫（仅对恶魔夜袭）
      // ======================================================================
      if (source === 'demon') {
        // 士兵天生免疫恶魔攻击（除非中毒）
        // 规则对齐：士兵在“中毒或醉酒”时免疫失效
        if (targetSeat.role?.id === 'soldier' && !isActorDisabledByPoisonOrDrunk(targetSeat)) {
          addLog(`🛡️ ${targetId + 1}号 [士兵] 免疫了恶魔的攻击！`);
          setCurrentModal({
            type: 'ATTACK_BLOCKED',
            data: {
              targetId,
              reason: '士兵免疫',
              demonName: nightInfo ? getDemonDisplayName(nightInfo.effectiveRole.id, nightInfo.effectiveRole.name) : undefined,
            },
          });
          return;
        }
      }

      // ======================================================================
      // 步骤 3: 检查是否被保护
      // ======================================================================
      // 3.1 “不会死亡”类保护（僧侣/旅店老板等）
      if (targetSeat.isProtected && targetSeat.protectedBy !== null) {
        const protectorSeat = seatsSnapshot.find((s) => s.id === targetSeat.protectedBy);
        const protectorRoleId = protectorSeat?.role?.id;
        const protectorName = protectorSeat?.role?.name || '未知';

        // 僧侣：仅对恶魔夜袭有效
        const monkBlocks = protectorRoleId === 'monk' && source === 'demon';
        // 旅店老板：当晚不会死亡（通常用于抵挡夜晚的各种死亡来源），但不影响处决
        const innkeeperBlocks = protectorRoleId === 'innkeeper' && source !== 'execution';
        // 其他保护：保持旧行为（只挡恶魔），避免影响 TB 既有逻辑
        const defaultBlocks = protectorRoleId !== 'innkeeper' && protectorRoleId !== 'monk' && source === 'demon';

        if (monkBlocks || innkeeperBlocks || defaultBlocks) {
          addLog(`🛡️ ${targetId + 1}号 被${protectorName}保护，免于死亡！`);
          setShowAttackBlockedModal({
            targetId,
            reason: `${protectorName}保护`,
            demonName: nightInfo ? getDemonDisplayName(nightInfo.effectiveRole.id, nightInfo.effectiveRole.name) : undefined,
          });
          return;
        }
      }
      
      // 3.2 茶艺师动态保护（对所有攻击）
      // 规则：刺客可以无视“不会死亡”类保护（含茶艺师），因此刺客击杀不应被此处拦截
      if (killerRoleId !== 'assassin' && hasTeaLadyProtection(targetSeat, seatsSnapshot)) {
        addLog(`${targetId + 1}被茶艺师保护未死亡`);
        setShowAttackBlockedModal({
          targetId,
          reason: '茶艺师保护',
          demonName: nightInfo ? getDemonDisplayName(nightInfo.effectiveRole.id, nightInfo.effectiveRole.name) : undefined,
        });
        return;
      }

      // ======================================================================
      // 步骤 4: 执行死亡
      // ======================================================================
      // 默认月之子/呆瓜死亡不立刻结算等待后续选择
      const shouldSkipGameOver = skipGameOverCheck || (targetSeat.role?.id === 'moonchild' || targetSeat.role?.id === 'klutz');

      let updatedSeats: Seat[] = [];
      setSeats(prev => {
        updatedSeats = prev.map(s => {
          if (s.id !== targetId) return s;
          let next: Seat = { ...s, isDead: true };
          // 僵怖假死状态再次被杀死算作真正死亡
          if (s.role?.id === 'zombuul' && s.isFirstDeathForZombuul && !s.isZombuulTrulyDead) {
            next = { ...next, isZombuulTrulyDead: true };
          }
          // 呆瓜死亡标记避免重复触发
          if (s.role?.id === 'klutz') {
            const details = Array.from(new Set([...(s.statusDetails || []), '呆瓜已触发']));
            next = { ...next, statusDetails: details };
          }
          if (seatTransformer) {
            next = seatTransformer(next);
          }
          return next;
        });
        return updatedSeats;
      });

      if (!keepInWakeQueue) {
        setWakeQueueIds(prev => prev.filter(id => id !== targetId));
      }

      if (recordNightDeath) {
        setDeadThisNight(prev => (prev.includes(targetId) ? prev : [...prev, targetId]));
      }

      enqueueRavenkeeperIfNeeded(targetId);

      // 理发师夜半狂欢版死亡恶魔当晚可选择两名玩家交换角色不能选择恶魔
      if (targetSeat.role?.id === 'barber_mr') {
        const demon = seatsSnapshot.find(s => (s.role?.type === 'demon' || s.isDemonSuccessor) && !s.isDead);
        if (demon) {
          setCurrentModal({ type: 'BARBER_SWAP', data: { demonId: demon.id, firstId: null, secondId: null } });
          addLog(`${targetSeat.id + 1}号(理发师)死亡，恶魔可选择两名玩家交换角色`);
        }
      }

      const finalize = (latestSeats?: Seat[]) => {
        // 使用最新的 seats 状态按优先级选择入最新引用本次更新快照 状态闭包
        const seatsToUse =
          (latestSeats && latestSeats.length ? latestSeats : null) ||
          (seatsRef.current && seatsRef.current.length ? seatsRef.current : null) ||
          (updatedSeats && updatedSeats.length ? updatedSeats : null) ||
          (seats && seats.length ? seats : null);

        if (!seatsToUse || seatsToUse.length === 0) {
          onAfterKill?.(seatsToUse || []);
          return;
        }

        const finalSeats = seatsToUse;

        // 诺-达杀人后邻近两名镇民中毒（直到诺-达失去能力 / 离场，这里近似为永久）
        if (killerRoleId === 'no_dashii') {
          // 规则：中毒的是"诺-达鲺本体"的两名邻近镇民，而非本次被杀死的目标
          const noDashiiSeat = finalSeats.find(s => s.role?.id === 'no_dashii' && !s.isDead);
          const originId = noDashiiSeat ? noDashiiSeat.id : targetId;
          const neighbors = getAliveNeighbors(finalSeats, originId).filter(s => s.role?.type === 'townsfolk');
          const poisoned = neighbors.slice(0, 2);
          if (poisoned.length > 0) {
            setSeats(p => p.map(s => {
              if (poisoned.some(pz => pz.id === s.id)) {
                const clearTime = '永久';
                const { statusDetails, statuses } = addPoisonMark(s, 'no_dashii', clearTime);
                const nextSeat = { ...s, statusDetails, statuses };
                return { ...nextSeat, isPoisoned: computeIsPoisoned(nextSeat) };
              }
              return { ...s, isPoisoned: computeIsPoisoned(s) };
            }));
            addLog(`诺-达使 ${poisoned.map(p => `${p.id+1}号`).join('、')}中毒`);
          }
        }

        // 方古：若被其能力杀死的目标为外来者且本局尚未成功转化，则目标变为新的方古，原方古死亡（仅首次成功转化生效）
        if (killerRoleId === 'fang_gu' && !fangGuConverted) {
          const targetRole = targetSeat.role;
          const isOutsider = targetRole?.type === 'outsider';
          if (isOutsider) {
            const fangGuRole = roles.find(r => r.id === 'fang_gu');
            setSeats(p => p.map(s => {
              // 目标外来者：转化为恶魔方古，并清理其身上的暂存状态（仍保留死亡状态由上方逻辑控制）
              if (s.id === targetId) {
                const next = cleanseSeatStatuses({ ...s, role: fangGuRole || s.role, isDemonSuccessor: false });
                return { ...next, isDead: false };
              }
              // 原方古：立即死亡（无论是否为继任恶魔）
              if (nightInfo && s.id === nightInfo.seat.id) {
                return { ...s, isDead: true };
              }
              return s;
            }));
            setFangGuConverted(true);
            if (nightInfo?.seat.id !== undefined) {
              const seatId = nightInfo.seat.id;
              addLog(`${seatId + 1}号(方古) 杀死外来者，目标转化为新的方古，原方古死亡（本局方古已完成一次转化）`);
            }
            onAfterKill?.(finalSeats);
            return;
          }
        }

        // Imp 星传检查：如果 Imp 自杀（恶魔攻击自己），检查是否传位
        // 注意：这里需要在 finalize 中检查，因为需要在死亡后处理
        if (targetSeat.role?.id === 'imp' && killerRoleId === 'imp' && nightInfo?.seat.id === targetId) {
          // Imp 攻击了自己（自杀），触发传位检查
          // 延迟调用以确保状态已更新
          setTimeout(() => {
            const latestSeats = seatsRef.current || finalSeats;
            const deadSeat = latestSeats.find(s => s.id === targetId);
            if (deadSeat) {
              checkImpStarPass(deadSeat, 'demon');
            }
          }, 0);
        }

        if (!shouldSkipGameOver) {
          moonchildChainPendingRef.current = false;
          checkGameOver(finalSeats, executedPlayerId);
        }
        onAfterKill?.(finalSeats);
      };

      if (targetSeat.role?.id === 'klutz' && !targetSeat.isDead && !(targetSeat.statusDetails || []).includes('呆瓜已触发')) {
        setCurrentModal({
          type: 'KLUTZ_CHOICE',
          data: { sourceId: targetId, onResolve: finalize },
        });
        addLog(`${targetId + 1}号(呆瓜) 死亡必须选择一名存活玩家`);
        return;
      }

      if (targetSeat.role?.id === 'sweetheart') {
        setCurrentModal({
          type: 'SWEETHEART_DRUNK',
          data: { sourceId: targetId, onResolve: finalize },
        });
        addLog(`${targetId + 1}号(心上人) 死亡将导致一名玩家今晚至次日黄昏醉酒`);
        return;
      }

      if (targetSeat.role?.id === 'moonchild') {
        moonchildChainPendingRef.current = true;
        setCurrentModal({
          type: 'MOONCHILD_KILL',
          data: { sourceId: targetId, onResolve: finalize },
        });
        return;
      }

      finalize(updatedSeats);
    },
    [seats, nightInfo, enqueueRavenkeeperIfNeeded, checkGameOver, hasTeaLadyProtection, getDemonDisplayName, fangGuConverted, addLog, setSeats, setWakeQueueIds, setDeadThisNight, setShowAttackBlockedModal, setShowBarberSwapModal, setShowKlutzChoiceModal, setShowSweetheartDrunkModal, setShowMoonchildKillModal, setFangGuConverted, checkImpStarPass, setCurrentModal]
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
          setSeats((prev) =>
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
      seatsRef,
    }
  );

  // 确认夜晚死亡报告后进入白天
  const confirmNightDeathReport = useCallback(() => {
    setCurrentModal(null);
    
    // 白天开始清理仅限夜晚的状态但保留魔鬼代言人的跨日保护
    cleanStatusesForNewDay();
    
    // 清除所有保护状态僧侣的保护只在夜晚有效
    setSeats(p => p.map(s => ({...s, isProtected: false, protectedBy: null})));
    
    // 检查罂粟种植者是否死亡如果死亡告知爪牙和恶魔彼此
    const poppyGrower = seats.find(s => s.role?.id === 'poppy_grower');
    if (poppyGrower && poppyGrower.isDead && !poppyGrowerDead) {
      setPoppyGrowerDead(true);
      const minions = seats.filter(s => s.role?.type === 'minion' && !s.isDead);
      const demons = seats.filter(s => (s.role?.type === 'demon' || s.isDemonSuccessor) && !s.isDead);
      const minionNames = minions.map(s => `${s.id+1}号`).join('、');
      const demonNames = demons.map(s => `${s.id+1}号`).join('、');
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
        setSeats(p => p.map(s => 
          s.id === newFarmer.id ? { ...s, role: farmerRole || s.role } : s
        ));
        addLog(`${deadFarmer+1}号(农夫)在夜晚死亡，${newFarmer.id+1}号变成农夫`);
      }
    }
    
    setDeadThisNight([]); // 清空夜晚死亡记录
    
    // 规则：每个黄昏（白天）开始时重置提名记录
    // 确保每名玩家在每个黄昏内只能提名一次，并且同个黄昏内也只能被提名一次
    setNominationRecords({ nominators: new Set(), nominees: new Set() });
    setNominationMap({});
    
    // 使用seatsRef确保获取最新的seats状态然后检查游戏结束条件
    const currentSeats = seatsRef.current;
    // 检查游戏结束条件包括存活人数
    if (checkGameOver(currentSeats)) {
      return;
    }
    setGamePhase("day");
  }, [seats, deadThisNight, poppyGrowerDead, cleanStatusesForNewDay, addLog, checkGameOver, setSeats, setCurrentModal, setPoppyGrowerDead, setDeadThisNight, setGamePhase, setNominationRecords, setNominationMap]);

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

  // 进入检查阶段（从setup阶段进入check阶段）
  const proceedToCheckPhase = useCallback((seatsToUse: Seat[]) => {
    setAutoRedHerringInfo(null);
    const active = seatsToUse.filter(s => s.role);

    // 1. 预处理：根据 SetupMeta / 旧字段生成 displayRole（用于 UI 展示）
    const processedSeats = active.map((seat) => {
      if (!seat.role) return seat;

      let nextDisplayRole = seat.displayRole;

      // A. 处理酒鬼（真实为酒鬼，但需要一个镇民外壳）
      if (seat.role.setupMeta?.isDrunk || seat.role.id === 'drunk' || seat.role.id === 'drunk_mr') {
        // 优先使用已经通过"酒鬼伪装"流程选择的 charadeRole，其次回退到现有 displayRole 或真实角色
        nextDisplayRole = seat.charadeRole || nextDisplayRole || seat.role;
      }

      // B. 处理疯子（认为自己是恶魔，需要一个恶魔外壳）
      if (seat.role.setupMeta?.isLunatic || seat.role.id === 'lunatic') {
        // TODO: 后续步骤中由说书人选择伪装的恶魔角色。
        // 目前占位：如果已经有人为设置了 displayRole，则保留；否则暂时使用自身角色。
        nextDisplayRole = nextDisplayRole || seat.displayRole || seat.role;
      }

      // 默认情况：展示角色 = 真实角色
      if (!nextDisplayRole) {
        nextDisplayRole = seat.role;
      }

      return {
        ...seat,
        displayRole: nextDisplayRole,
      };
    });

    // 2. 紧凑化座位 ID（仅用于游戏内部逻辑与展示）
    const compact = processedSeats.map((s, i) => ({ ...s, id: i }));

    // 3. 预生成首夜时间线（基于真实角色，用于后续功能）
    try {
      generateNightTimeline(compact, true);
    } catch (e) {
      // 时间线生成失败，继续执行
    }

    setTimeout(() => {
      const withRed = [...compact];
      const hasFortuneTeller = withRed.some(s => s.role?.id === "fortune_teller");
      if (hasFortuneTeller && !withRed.some(s => s.isRedHerring)) {
        // 官方：天敌红罗剎必须是“善良玩家”；若未来阵营变化导致其变邪恶，需要重新指派
        const good = withRed.filter(
          (s) =>
            ["townsfolk", "outsider"].includes(s.role?.type || "") &&
            isGoodAlignment(s)
        );
        if (good.length > 0) {
          const t = getRandom(good);
          withRed[t.id] = { 
            ...withRed[t.id], 
            isRedHerring: true, 
            statusDetails: [...(withRed[t.id].statusDetails || []), "天敌红罗剎"] 
          };
          const redRoleName = withRed[t.id].role?.name || '未知角色';
          addLog(`天敌红罗剎分配${t.id+1}号：${redRoleName}`);
          setAutoRedHerringInfo(`${t.id + 1}号：${redRoleName}`);
        }
      }
      
      // 检查是否有送葬者如果有则添加说明日志
      const hasUndertaker = withRed.some(s => s.role?.id === "undertaker");
      if (hasUndertaker) {
        addLog(`送葬者：只在非首夜的夜晚被唤醒，且只会看到"今天黄昏被处决并死亡的玩家"`);
      }
      
      setSeats(withRed); 
      setInitialSeats(JSON.parse(JSON.stringify(withRed))); 
      setGamePhase("check");
    }, 100);
  }, [addLog, setSeats, setInitialSeats, setGamePhase, setAutoRedHerringInfo]);

  // 处理预开始夜晚（从setup阶段进入check阶段）
  const handlePreStartNight = useCallback(() => {
    proceedToCheckPhase(seats);
  }, [proceedToCheckPhase, seats]);

  // 处理开始夜晚（从check阶段或其他阶段进入夜晚）
  const handleStartNight = useCallback((isFirst: boolean) => {
    if (!nightLogic?.startNight) {
      alert('游戏状态错误：无法开始夜晚。请刷新页面重试。');
      return;
    }
    
    try {
      // 占卜师的天敌红罗剎：若当前标记不在善良玩家身上（例如后续阵营变化），需要重新指派
      setSeats((prev) => {
        const hasFT = prev.some((s) => s.role?.id === "fortune_teller");
        if (!hasFT) return prev;

        const current = prev.find((s) => s.isRedHerring);
        const currentIsValidGood = !!current && isGoodAlignment(current);
        if (currentIsValidGood) return prev;

        const candidates = prev.filter(
          (s) =>
            ["townsfolk", "outsider"].includes(s.role?.type || "") &&
            isGoodAlignment(s) &&
            !s.isRedHerring
        );
        if (candidates.length === 0) return prev;

        const chosen = getRandom(candidates);
        const next = prev.map((s) => {
          if (s.isRedHerring) {
            return {
              ...s,
              isRedHerring: false,
              statusDetails: (s.statusDetails || []).filter((x) => x !== "天敌红罗剎"),
            };
          }
          if (s.id === chosen.id) {
            return {
              ...s,
              isRedHerring: true,
              statusDetails: [...(s.statusDetails || []), "天敌红罗剎"],
            };
          }
          return s;
        });

        const redRoleName = chosen.role?.name || "未知角色";
        addLog(`天敌红罗剎重新指派至${chosen.id + 1}号：${redRoleName}`);
        setAutoRedHerringInfo(`${chosen.id + 1}号：${redRoleName}`);
        return next;
      });

      nightLogic.startNight(isFirst);
    } catch (error) {
      alert(`入夜时发生错误: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [addLog, nightLogic, setSeats, setAutoRedHerringInfo]);

  // CRITICAL FIX: Synchronous transition to First Night
  // This function bypasses the complex async startNight logic and directly transitions
  const proceedToFirstNight = useCallback(() => {

    // 1. Force verify seats exist
    if (!seats || seats.length === 0) {
      alert("错误：没有座位数据，无法入夜。");
      return;
    }

    // 2. Generate Timeline IMMEDIATELY using current seats
    let newTimeline: TimelineStep[];
    try {
      newTimeline = generateNightTimeline(seats, true); // true = firstNight
      if (newTimeline.length === 0) {
        // Even if empty, ensure we have at least a dawn step
        newTimeline = [{
          id: 'dawn_step',
          type: 'dawn',
          order: 99999,
          content: { 
            title: '天亮了', 
            script: '所有玩家请睁眼', 
            instruction: '点击进入白天阶段' 
          },
          interaction: { 
            type: 'none', 
            amount: 0, 
            required: false,
            canSelectSelf: false,
            canSelectDead: false,
            effect: { type: 'none' }
          }
        }];
      }
    } catch (error) {
      alert(`生成时间轴失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return;
    }

    // 3. Extract wakeQueueIds from timeline (character steps only)
    const wakeQueueIds = newTimeline
      .filter(step => step.type === 'character' && step.seatId !== undefined)
      .map(step => step.seatId!)
      .filter((id, index, arr) => arr.indexOf(id) === index); // Remove duplicates

    // 【调试日志】输出队列生成信息
    console.log('[proceedToFirstNight] 生成的队列:', wakeQueueIds);
    console.log('[proceedToFirstNight] 队列长度:', wakeQueueIds.length);
    console.log('[proceedToFirstNight] 当前座位数:', seats.length);
    console.log('[proceedToFirstNight] 有角色的座位:', seats.filter(s => s.role).map(s => ({
      id: s.id,
      roleId: s.role?.id,
      roleName: s.role?.name,
      isDead: s.isDead,
    })));
    
    if (wakeQueueIds.length === 0) {
      console.warn('[proceedToFirstNight] ⚠️ 警告：生成的队列为空！可能原因：');
      console.warn('  1. 没有分配角色');
      console.warn('  2. 分配的角色都没有夜晚行动（如全是村民）');
      console.warn('  3. 所有角色都已死亡');
    }

    // 4. Batch Update State (The Critical Fix)
    // We must set ALL these at once to prevent race conditions.
    setWakeQueueIds(wakeQueueIds);
    setCurrentWakeIndex(0); // Force reset to start
    setSelectedActionTargets([]);
    setInspectionResult(null);
    setGamePhase('firstNight');
    
    // 5. Clear any blocking flags
    setCurrentModal(null);
    setPendingNightQueue(null);

  }, [seats, setWakeQueueIds, setCurrentWakeIndex, setSelectedActionTargets, setInspectionResult, setGamePhase, setCurrentModal, setPendingNightQueue]);

  // 关闭夜晚顺序预览模态框
  const closeNightOrderPreview = useCallback(() => {
    setCurrentModal(null);
    setPendingNightQueue(null);
  }, [setCurrentModal, setPendingNightQueue]);

  // 确认夜晚顺序预览，开始夜晚
  const confirmNightOrderPreview = useCallback(() => {
    // 立即关闭弹窗，避免用户重复点击
    setCurrentModal(null);
    
    if (!pendingNightQueue || pendingNightQueue.length === 0) {
      // 空队列：直接进入首夜阶段
      setPendingNightQueue(null);
      setWakeQueueIds([]);
      setCurrentWakeIndex(0);
      setSelectedActionTargets([]);
      setInspectionResult(null);
      setGamePhase('firstNight');
      addLog('首夜：无需要唤醒的角色，直接进入天亮阶段');
      return;
    }
    
    if (!nightLogic?.finalizeNightStart) {
      // 如果 nightLogic 不可用，关闭弹窗并返回
      setPendingNightQueue(null);
      return;
    }
    
    // 使用 nightLogic 的 finalizeNightStart 来正确设置 wakeQueueIds
    try {
      nightLogic.finalizeNightStart(pendingNightQueue, true);
    } catch (error) {
      // 即使出错也要关闭弹窗
      setPendingNightQueue(null);
    }
  }, [pendingNightQueue, nightLogic, setCurrentModal, setPendingNightQueue, setWakeQueueIds, setCurrentWakeIndex, setSelectedActionTargets, setInspectionResult, setGamePhase, addLog]);

  // 确认酒鬼伪装角色选择
  const confirmDrunkCharade = useCallback((role: Role) => {
    if (currentModal?.type !== 'DRUNK_CHARADE') return;
    const seatId = currentModal.data.seatId;
    setSeats(prev => prev.map(s => {
      if (s.id === seatId && s.role?.id === 'drunk') {
        return { ...s, charadeRole: role, displayRole: role };
      }
      return s;
    }));
    setCurrentModal(null);
    addLog(`${seatId + 1}号(酒鬼) 伪装为 ${role.name}`);
  }, [currentModal, setSeats, setCurrentModal, addLog]);

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

  // 复活座位（清理临时负面状态）
  const reviveSeat = useCallback((seat: Seat): Seat => {
    // 复活时清理所有临时负面状态与死而有能只保留永久中毒等持续效果
    return cleanseSeatStatuses({
      ...seat,
      isEvilConverted: false,
      isZombuulTrulyDead: seat.isZombuulTrulyDead,
      hasGhostVote: true,
    });
  }, [cleanseSeatStatuses]);

  // 将玩家插入到当前唤醒队列之后（按夜晚顺序）
  const insertIntoWakeQueueAfterCurrent = useCallback((seatId: number, opts?: { roleOverride?: Role | null; logLabel?: string }) => {
    if (!['night','firstNight'].includes(gamePhase)) return;
    let inserted = false;
    setWakeQueueIds(prev => {
      if (prev.includes(seatId)) return prev;
      const processed = prev.slice(0, currentWakeIndex + 1);
      if (processed.includes(seatId)) return prev;
      const seatsSnapshot = seatsRef.current || seats;
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
    insertIntoWakeQueueAfterCurrent(targetId, { logLabel: `${targetId+1}号转为邪恶` });
  }, [setSeats, cleanseSeatStatuses, insertIntoWakeQueueAfterCurrent]);

  /**
   * 改变角色（转换）
   * 用于玩家转变成另一个角色（如哲学家获得能力、方古跳转等）
   * @param seatId 目标座位ID
   * @param newRoleId 新角色ID
   */
  const changeRole = useCallback((seatId: number, newRoleId: string) => {
    const newRole = roles.find(r => r.id === newRoleId);
    if (!newRole) {
      // Role not found, skip
      return;
    }

    // 相克规则：灯神在场时，互为克星的角色不能同时在场
    if (isAntagonismEnabled(seats)) {
      const decision = checkMutualExclusion({ seats, enteringRoleId: newRoleId, roles });
      if (!decision.allowed) {
        alert(decision.reason);
        addLog(`⛔ ${decision.reason}`);
        return;
      }
    }

    setSeats(prev => prev.map(s => {
      if (s.id !== seatId) return s;
      return {
        ...s,
        role: newRole, // Overwrite the REAL role
        displayRole: newRole, // Update display role as well
      };
    }));
    
    addLog(`🔄 ${seatId+1}号 的身份变成了 [${newRole.name}]`);
  }, [roles, setSeats, addLog, seats]);

  /**
   * 交换角色（理发师/麻脸巫婆等）
   * 用于两个玩家交换角色
   * @param seatId1 第一个座位ID
   * @param seatId2 第二个座位ID
   */
  const swapRoles = useCallback((seatId1: number, seatId2: number) => {
    setSeats(prev => {
      const s1 = prev.find(s => s.id === seatId1);
      const s2 = prev.find(s => s.id === seatId2);
      if (!s1 || !s2) {
        // One or both seats not found, skip
        return prev;
      }
      
      return prev.map(s => {
        if (s.id === seatId1) return { ...s, role: s2.role, displayRole: s2.displayRole };
        if (s.id === seatId2) return { ...s, role: s1.role, displayRole: s1.displayRole };
        return s;
      });
    });
    addLog(`🔀 ${seatId1+1}号 和 ${seatId2+1}号 交换了角色`);
  }, [setSeats, addLog]);

  // ======================================================================
  //  Modal and Action Handlers - Moved from page.tsx
  // ======================================================================
  
  // Handle confirm action for night actions
  // 重构：使用角色特定的处理函数，职责分离
  const handleConfirmAction = useCallback(() => {
    if (!nightInfo) return;
    
    // 首先检查是否有待确认的弹窗
    if (currentModal !== null) {
      return;
    }
    
    // 规则：如果能力描述中没有"选择"一词，这项能力就由说书人来做出选择
    // 检测能力描述中是否包含"选择"关键词
    const abilityText = nightInfo.effectiveRole.ability || '';
    const hasChoiceKeyword = abilityText.includes('选择');
    
    // 如果能力描述中没有"选择"，且当前没有选中目标，触发说书人选择弹窗
    if (!hasChoiceKeyword && selectedActionTargets.length === 0) {
      const roleId = nightInfo.effectiveRole.id;
      const roleName = nightInfo.effectiveRole.name;
      const description = abilityText || `使用${roleName}的能力`;
      
      // 获取目标数量（从角色元数据或默认1）
      const targetCount = getRoleTargetCount(roleId, gamePhase === 'firstNight')?.max ?? 1;
      
      // 触发说书人选择弹窗
      setCurrentModal({
        type: 'STORYTELLER_SELECT',
        data: {
          sourceId: nightInfo.seat.id,
          roleId,
          roleName,
          description,
          targetCount,
          onConfirm: (targetIds: number[]) => {
            // 设置选中的目标
            setSelectedActionTargets(targetIds);
            // 关闭弹窗
            setCurrentModal(null);
            // 注意：不需要递归调用，因为设置selectedActionTargets后，
            // 用户需要再次点击"确认"按钮才会继续处理行动
            // 这样可以避免无限递归，并让用户有机会确认选择
          }
        }
      });
      return;
    }
    
    // 尝试使用角色特定的处理函数
    const roleId = nightInfo.effectiveRole.id;
    const handler = getRoleConfirmHandler(roleId);
    
    if (handler) {
        const context: RoleConfirmContext = {
          nightInfo,
          seats,
          selectedTargets: selectedActionTargets,
          gamePhase,
          nightCount,
          roles,
          setSeats,
          setSelectedActionTargets,
          currentModal,
          setCurrentModal,
          getSeatRoleId,
          cleanseSeatStatuses,
          insertIntoWakeQueueAfterCurrent,
          continueToNextAction,
          addLog,
          killPlayer,
          hasUsedAbility,
          markAbilityUsed,
          reviveSeat,
          setPukkaPoisonQueue,
          setDeadThisNight,
          poChargeState,
          setPoChargeState,
          addDrunkMark,
          isEvil,
        };
      
      const result = handler(context);
      if (result.handled) {
        if (result.shouldWait) {
          // 需要等待（例如弹窗确认）
          return;
        }
        // 已处理且不需要等待，继续流程
        return;
      }
    }
    
    // 如果没有角色特定的处理函数，使用通用逻辑继续流程
    // 所有需要特殊处理的角色都应该在 roleActionHandlers.ts 中实现
    continueToNextAction();
  }, [nightInfo, seats, selectedActionTargets, gamePhase, nightCount, roles, currentModal, setSeats, setSelectedActionTargets, getSeatRoleId, cleanseSeatStatuses, insertIntoWakeQueueAfterCurrent, continueToNextAction, setCurrentModal, killPlayer, hasUsedAbility, markAbilityUsed, reviveSeat, setPukkaPoisonQueue, setDeadThisNight, addLog, poChargeState, setPoChargeState, addDrunkMark, isEvil, getRoleConfirmHandler]);

  // Execute player (execution logic)
  const executePlayer = useCallback((id: number, options?: { skipLunaticRps?: boolean; forceExecution?: boolean }) => {
    const seatsSnapshot = seatsRef.current || seats;
    const t = seatsSnapshot.find(s => s.id === id);
    if (!t || !t.role) return;
    const skipLunaticRps = options?.skipLunaticRps;
    const forceExecution = options?.forceExecution;

    // ======================================================================
    // 重构：优先使用角色定义的 onExecution 方法
    // ======================================================================
    const execContext: ExecutionHandlerContext = {
      executedSeat: t,
      seats: seatsSnapshot,
      gamePhase,
      nightCount,
      nominationMap,
      forceExecution,
      skipLunaticRps,
      setSeats,
      setWinResult,
      setWinReason,
      setGamePhase,
      addLog,
      checkGameOver,
      setCurrentModal,
    };
    
    const execResult = handleExecution(execContext);
    
    // 如果角色定义了 onExecution 且返回 handled: true
    if (execResult && execResult.handled) {
      // 如果需要等待（例如弹窗确认）
      if (execResult.shouldWait) {
        // 根据角色类型设置相应的弹窗
        if (t.role.id === 'saint' && !forceExecution) {
          setCurrentModal({ type: 'SAINT_EXECUTION_CONFIRM', data: { targetId: id, skipLunaticRps } });
        } else if (t.role.id === 'lunatic_mr' && !skipLunaticRps) {
          const nominatorId = nominationMap[id] ?? null;
          setCurrentModal({ type: 'LUNATIC_RPS', data: { targetId: id, nominatorId } });
        }
        return;
      }
      
      // 如果需要继续到下一个夜晚（例如僵怖假死）
      if (execResult.shouldContinueToNight) {
        setExecutedPlayerId(id);
        setTodayExecutedId(id);
        setCurrentDuskExecution(id);
        
        // 检查游戏结束
        const updatedSeats = execResult.seatUpdates 
          ? seatsSnapshot.map(s => {
              const update = execResult.seatUpdates!.find(u => u.id === s.id);
              return update ? { ...s, ...update } : s;
            })
          : seatsSnapshot;
        
        if (checkGameOver(updatedSeats, id)) {
          return;
        }
        
        setTimeout(() => {
          nightLogic.startNight(false);
        }, 500);
        return;
      }
      
      // 如果游戏已结束，直接返回
      if (execResult.gameOver) {
        setExecutedPlayerId(id);
        setCurrentDuskExecution(id);
        return;
      }
      
      // 其他情况继续默认逻辑
    }
    
    // ======================================================================
    // 保留的硬编码逻辑（逐步迁移到角色定义中）
    // ======================================================================

    // 弄臣：第一次将要死亡时不死亡（若中毒/醉酒则无效）
    // 这里处理“处决导致的死亡”，其他来源的死亡由 killPlayer 处理
    if (t.role.id === 'fool') {
      const alreadyTriggered = (t.statusDetails || []).some((d) => d.includes('弄臣免死已触发'));
      const disabled = isActorDisabledByPoisonOrDrunk(t);
      if (!alreadyTriggered && !disabled && !forceExecution) {
        setSeats(prev => prev.map(s => {
          if (s.id !== id) return s;
          const details = Array.from(new Set([...(s.statusDetails || []), '弄臣免死已触发']));
          return { ...s, statusDetails: details };
        }));
        addLog(`🃏 ${id+1}号 [弄臣] 第一次将要死亡，免于死亡（处决无效）`);
        setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `🃏 ${id+1}号（弄臣）第一次将要死亡，本次不死亡` } });
        setExecutedPlayerId(id);
        setCurrentDuskExecution(id);
        return;
      }
    }

    // 和平主义者：被处决的镇民“可能”不死（由说书人裁定/随机）
    // 仅在“处决一个镇民且将要死亡”时询问；若已有其他处决保护/茶艺师保护则不会走到这里
    if (!forceExecution && t.role.type === 'townsfolk') {
      const pacifists = seatsSnapshot.filter(s => s.role?.id === 'pacifist' && !s.isDead && isGoodAlignment(s));
      const hasActivePacifist = pacifists.some(p => !isActorDisabledByPoisonOrDrunk(p));
      if (hasActivePacifist) {
        setCurrentModal({
          type: 'PACIFIST_CONFIRM',
          data: {
            targetId: id,
            onResolve: (saved: boolean) => {
              if (saved) {
                addLog(`🕊️ 和平主义者：${id+1}号 镇民本次处决不死亡`);
                setExecutedPlayerId(id);
                setCurrentDuskExecution(id);
                setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `🕊️ 和平主义者：${id+1}号 镇民本次处决不死亡` } });
                return;
              }
              // 未触发：继续正常处决流程（强制执行一次以避免递归弹窗）
              executePlayer(id, { skipLunaticRps, forceExecution: true });
              setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `${id+1}号被处决` } });
            }
          }
        });
        return;
      }
    }

    // 茶艺师动态保护邻座善良茶艺师保护的善良玩家无法被处
    if (hasTeaLadyProtection(t, seatsSnapshot)) {
      addLog(`🛡️ ${id+1}号 被茶艺师保护，免于被处决！`);
      setCurrentModal({ type: 'ATTACK_BLOCKED', data: { targetId: id, reason: '茶艺师保护' } });
      setExecutedPlayerId(id);
      setCurrentDuskExecution(id);
      return;
    }
    
    // 魔鬼代言人/和平主义者/水手保护 - 检查处决免疫状态
    // 隐性规则2：不能最大 - 禁止性规则优先于允许性规则
    // 注意：刺客等角色的能力会让保护无效，但此处是处决而非攻击，所以不需要传入攻击者角色
    if (hasExecutionProof(t)) {
      // 区分不同的保护来源
      const protectionDetails = (t.statusDetails || []).find((detail) => 
        detail.includes('execution_protected') || detail.includes('处决保护')
      );
      const protectionReason = protectionDetails || '技能保护';
      
      addLog(`🛡️ ${id+1}号 免于被处决！(${protectionReason})`);
      setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `🛡️ 处决失败：${id+1}号 受到技能保护，无法死亡（${protectionReason}）` } });
      setExecutedPlayerId(id);
      setCurrentDuskExecution(id);
      return;
    }
    
    // 和平主义者触发检查（通过 triggerMeta.onExecution）
    // 注意：和平主义者的保护是随机的，由说书人决定
    // 这里我们检查是否有手动标记的保护状态
    if (t.role?.triggerMeta?.onExecution && t.role.id === 'pacifist') {
      // 和平主义者的保护应该由说书人在UI中手动标记
      // 如果有 execution_protected 状态，上面的 hasExecutionProof 已经处理了
      // 这里只是记录日志
      // 和平主义者可能触发保护（需要说书人确认）
    }
    
    const isZombuul = t.role?.id === 'zombuul';
    const zombuulLives = t.zombuulLives ?? 1;
    
    const markDeath = (overrides: Partial<Seat> = {}) =>
      seats.map(s => s.id === id ? { ...s, isDead: true, ...overrides } : s);
    
    // 僵怖第一次被处决假死保留夜间行动但消耗一次僵怖生
    if (isZombuul && zombuulLives > 0 && !t.isZombuulTrulyDead && !t.isFirstDeathForZombuul) {
      const updatedSeats = seats.map(s => {
        if (s.id !== id) return s;
        const details = s.statusDetails || [];
        const hasFakeDeathTag = details.includes('僵怖假死');
        return {
          ...s,
          // UI 可以通过状态标签体现假死但逻辑上仍视为存活
          isDead: false,
          isFirstDeathForZombuul: true,
          isZombuulTrulyDead: false,
          zombuulLives: Math.max(0, zombuulLives - 1),
          statusDetails: hasFakeDeathTag ? details : [...details, '僵怖假死']
        };
      });
      
      setSeats(updatedSeats);
      addLog(`${id+1}僵 被处决假死游戏继续`);
      setExecutedPlayerId(id);
      setTodayExecutedId(id);
      setCurrentDuskExecution(id);
      
      // 检查其他即时结束条件如圣徒正常情况下不会结束
      if (checkGameOver(updatedSeats, id)) {
        return;
      }
      
      setTimeout(() => {
        nightLogic.startNight(false);
      }, 500);
      return;
    }
    
    // 10. 检查小恶魔是否被处决 - 先检查红唇女郎
    let newSeats = markDeath(isZombuul ? { isZombuulTrulyDead: true, zombuulLives: 0 } : {});
    
    // 优先检查圣徒被处决导致邪恶方获胜优先级高于恶魔死亡判定
    // 这个检查必须在恶魔死亡检查之前确保圣徒被处决的判定优先级更
    // 虽然通常不会同时发生但在复杂结算中要注意优先级
    if (t?.role?.id === 'saint' && !isActorDisabledByPoisonOrDrunk(t)) {
      setSeats(newSeats);
      addLog(`${id+1}被处决`);
      setExecutedPlayerId(id);
      setCurrentDuskExecution(id);
      setWinResult('evil');
      setWinReason('圣徒被处决');
      setGamePhase('gameOver');
      addLog("游戏结束圣徒被处决邪恶胜");
      return;
    }
    
    // 10. 立即检查恶魔是否死亡包括所有恶魔类型
    if ((t.role?.type === 'demon' || t.isDemonSuccessor)) {
      // 僵怖特殊处理耗尽僵怖生命后再被处决才算真正死亡
      if (isZombuul) {
        const updatedSeats = newSeats.map(s => 
          s.id === id ? { ...s, isZombuulTrulyDead: true, zombuulLives: 0 } : s
        );
        setSeats(updatedSeats);
        addLog(`${id+1}僵 被处决真正死亡`);
        setWinResult('good');
        setWinReason('僵怖被处决');
        setGamePhase('gameOver');
        addLog("游戏结束僵怖被处决好人胜");
        setExecutedPlayerId(id);
        setCurrentDuskExecution(id);
        return;
      }
      
      // 主谋（Mastermind）不在这里做“首夜处决恶魔直接邪恶胜”的硬编码裁定；
      // 统一交由 checkGameOver 处理“恶魔死亡->额外一天”的规则。
      
      // 计算处决后的存活玩家数量（旅行者不计入；僵怖假死视为存活）
      const aliveSeatsAfter = newSeats.filter(s => {
        if (!s || !s.role) return false;
        if (s.role.id === 'zombuul' && s.isFirstDeathForZombuul && !s.isZombuulTrulyDead) {
          return true;
        }
        return !s.isDead;
      });
      const aliveCount = aliveSeatsAfter.filter(s => s.role && s.role.type !== 'traveler').length;
      
      // 检查红唇女郎是否可以变成恶
      const scarletWoman = newSeats.find(s => 
        s.role?.id === 'scarlet_woman' && !s.isDead && !s.isDemonSuccessor
      );
      
      // 如果存活玩家数量 >= 5 且红唇女郎存活让红唇女郎变成恶
      if (aliveCount >= 5 && scarletWoman) {
        // 获取被处决的恶魔角色
        const demonRole = t.role;
        if (demonRole) {
          // 将红唇女郎变成恶
          const updatedSeats = newSeats.map(s => {
            if (s.id === scarletWoman.id) {
              const statusDetails = [...(s.statusDetails || []), '恶魔传位'];
              return {
                ...s,
                role: demonRole,
                isDemonSuccessor: true,
                statusDetails: statusDetails
              };
            }
            // 保证全局只有一个“恶魔继任者”标记，避免后续胜负/注册出现分叉
            return s.isDemonSuccessor ? { ...s, isDemonSuccessor: false } : s;
          });
          
          setSeats(updatedSeats);
          addLog(`${id+1}号(${demonRole.name}) 被处决`);
          addLog(`${scarletWoman.id+1}号(红唇女郎) 变成新的${demonRole.name}`);
          
          // 继续游戏不触发游戏结束
          setExecutedPlayerId(id);
          setCurrentDuskExecution(id);
          
          // 检查游戏结束条件不应该结束因为新恶魔还在
          if (checkGameOver(updatedSeats)) {
            return;
          }
          
          // 进入下一个夜
          setTimeout(() => {
            nightLogic.startNight(false);
          }, 500);
          return;
        }
      }
      
      // 如果不满足红唇女郎变身条件：恶魔确实死亡
      // 注意：此处不要直接判定好人胜利（主谋可能让游戏继续额外一天），统一交由 checkGameOver 决定
      setSeats(newSeats);
      addLog(`${id+1}号(${t.role?.name || '小恶魔'}) 被处决`);
      setExecutedPlayerId(id);
      setTodayExecutedId(id);
      setCurrentDuskExecution(id);
      setHasExecutedThisDay(true); // Mark execution for Vortox check
      if (checkGameOver(newSeats, id)) {
        return;
      }
      setTimeout(() => {
        nightLogic.startNight(false);
      }, 500);
      return;
    }
    
    // 无神论者特殊处理如果说书人被处决这里用特殊标记表示好人获胜
    // 注意实际游戏中说书人不会被处决这里只是逻辑标记
    if (t?.role?.id === 'atheist') {
      // 无神论者被处决时检查是否有特殊标记表示"说书人被处决"
      // 实际游戏中需要说书人手动标记
      // 这里简化处理如果无神论者被处决说书人可以手动触发好人获胜
      addLog(`${id+1}无神论 被处决如果说书人被处决好人阵营获胜`);
    }
    
    // 食人族获得最后被处决玩家的能
    const cannibal = seats.find(s => s.role?.id === 'cannibal' && !s.isDead);
    if (cannibal && t && t.role) {
      // 检查被处决的玩家是否是邪恶阵营
      const roleType = t.role.type as RoleType;
      const isEvilExecuted = (roleType === 'demon' || roleType === 'minion' || t.isDemonSuccessor);
      setSeats(p => p.map(s => {
        if (s.id === cannibal.id) {
          // 检查是否有永久中毒舞蛇人制造或亡骨魔中毒
          // 这些永久中毒不能被食人族的能力清除
          const hasPermanentPoison = s.statusDetails?.some(d => d.includes('永久中毒')) || false;
          const hasVigormortisPoison = s.statusDetails?.some(d => d.includes('亡骨魔中毒')) || false;
          // 如果被处决的是善良玩家清除临时中毒食人族能力造成的中毒
          // 但必须保留永久中毒和亡骨魔中毒
          // 如果被处决的是邪恶玩家设置临时中毒但也要保留永久中毒
          if (isEvilExecuted) {
            // 食人族中毒直到下一个善良玩家被处决
            const clearTime = '下一个善良玩家被处决';
            const { statusDetails, statuses } = addPoisonMark(s, 'cannibal', clearTime);
            const nextSeat = { ...s, statusDetails, statuses };
            return { 
              ...nextSeat, 
              isPoisoned: computeIsPoisoned(nextSeat),
              // 记录最后被处决的玩家ID用于后续能力处理
              masterId: id
            };
          } else {
            // 清除食人族中毒但保留永久中毒和亡骨魔中毒
            const filteredDetails = (s.statusDetails || []).filter(d => !d.includes('食人族中毒'));
            const filteredStatuses = (s.statuses || []).filter(st => 
              !(st.effect === 'Poison' && s.statusDetails?.some(d => d.includes('食人族中毒')))
            );
            const nextSeat = { ...s, statusDetails: filteredDetails, statuses: filteredStatuses };
            return { 
              ...nextSeat, 
              isPoisoned: computeIsPoisoned(nextSeat),
              // 记录最后被处决的玩家ID用于后续能力处
              masterId: id
            };
          }
        }
        return s;
      }));
      if (isEvilExecuted) {
        addLog(`${cannibal.id+1}号(食人魔) 获得 ${id+1}号的能力，但因该玩家是邪恶的，食人魔中毒直到下一个善良玩家被处决`);
      } else {
        addLog(`${cannibal.id+1}号(食人魔) 获得 ${id+1}号的能力`);
      }
    }
    
    setSeats(newSeats);
    addLog(`${id+1}号被处决`); 
    setExecutedPlayerId(id);
    setTodayExecutedId(id);
    setHasExecutedThisDay(true); // Mark execution for Vortox check
    // 10. 记录当前黄昏的处决用于送葬者
    // 这个记录会在进入下一个黄昏时更新为lastDuskExecution
    setCurrentDuskExecution(id);

    // BMR：吟游诗人（Minstrel）
    // 若有爪牙被处决且吟游诗人存活且未中毒/醉酒，则所有存活玩家醉酒直到下个黄昏。
    if (t.role?.type === 'minion') {
      const minstrelSeat = seatsSnapshot.find(s => s.role?.id === 'minstrel' && !s.isDead);
      if (minstrelSeat && !isActorDisabledByPoisonOrDrunk(minstrelSeat)) {
        const clearTime = '下个黄昏';
        setSeats(prev => prev.map(s => {
          if (!s.role || s.isDead) return s;
          const { statusDetails, statuses } = addDrunkMark(s, 'minstrel', clearTime);
          const next = { ...s, statusDetails, statuses };
          return { ...next, isDrunk: true };
        }));
        addLog(`🎻 吟游诗人能力触发：爪牙被处决，所有存活玩家醉酒直到下个黄昏`);
      }
    }
    
    // 教父：记录今日是否有外来者被处决（供当夜教父额外杀人触发）
    const executedRole = t.role;
    if (executedRole?.type === 'outsider') {
      setOutsiderDiedToday(true);
      addLog(`📜 规则提示：今日有外来者被处决，若场上有教父且未醉/毒，当晚将被唤醒执行额外杀人`);
    }
    
    // 立即检查游戏结束条件包括存活人数和恶魔死亡/主谋额外一天
    // 注意圣徒被处决的检查已经在前面优先处理了checkGameOver 内部也会检查作为双重保
    if (checkGameOver(newSeats, id)) {
      return;
    }
    
    // 无神论者特殊胜利条件如果说书人被处决好人阵营获
    // 注意这里需要说书人手动标记"说书人被处决"
    // 暂时不自动触发需要说书人手动处理
    
    // 5. 屏蔽浏览器弹窗直接进入夜晚
    setTimeout(() => { 
      nightLogic.startNight(false); 
    }, 500);
  }, [seats, seatsRef, nominationMap, hasTeaLadyProtection, hasExecutionProof, checkGameOver, setSeats, addLog, setExecutedPlayerId, setCurrentDuskExecution, setTodayExecutedId, setWinResult, setWinReason, setGamePhase, setShowSaintExecutionConfirmModal, setShowLunaticRpsModal, setShowExecutionResultModal, gamePhase, nightLogic, addPoisonMark, computeIsPoisoned]);

  // ======================================================================
  //  Additional Modal Handlers - Continue migrating from page.tsx
  // ======================================================================

  // Confirm kill handler
  const confirmKill = useCallback(() => {
    if(!nightInfo || currentModal?.type !== 'KILL_CONFIRM') return;
    const targetId = currentModal.data.targetId;
    const impSeat = nightInfo.seat;
    
    // 如果当前执行杀人能力的角色本身中毒/醉酒则本次夜间攻击应视为无事发生
    const actorSeat = seats.find(s => s.id === nightInfo?.seat?.id);
    if (isActorDisabledByPoisonOrDrunk(actorSeat, nightInfo.isPoisoned)) {
      addLogWithDeduplication(
        `${nightInfo?.seat?.id ? nightInfo.seat.id + 1 : 0}号(${nightInfo?.effectiveRole?.name ?? ''}) 处于中毒/醉酒状态，本夜对${targetId+1}号的攻击无效，无事发生`,
        nightInfo.seat.id,
        nightInfo.effectiveRole.name
      );
      setCurrentModal(null);
      setSelectedActionTargets([]);
      continueToNextAction();
      return;
    }
    
    // 重构：使用 roleActionHandlers 处理小恶魔自杀逻辑
    if (targetId === impSeat.id && nightInfo.effectiveRole.id === 'imp') {
      const result = handleImpSuicide(impSeat.id, targetId, {
        seats,
        roles,
        setSeats,
        setWakeQueueIds,
        setDeadThisNight,
        checkGameOver,
        enqueueRavenkeeperIfNeeded,
        killPlayer,
        addLogWithDeduplication,
        getRandom,
        seatsRef,
      });
      
      if (result.handled) {
        setCurrentModal(null);
        if (!result.shouldContinue) {
          return;
        }
      }
    } else {
      const result = nightLogic.processDemonKill(targetId);
      if (result === 'pending') return;
    }
    setShowKillConfirmModal(null);
    if (moonchildChainPendingRef.current) return;
    continueToNextAction();
  }, [nightInfo, showKillConfirmModal, seats, isActorDisabledByPoisonOrDrunk, addLogWithDeduplication, setShowKillConfirmModal, setSelectedActionTargets, continueToNextAction, getRandom, roles, setSeats, setWakeQueueIds, seatsRef, checkGameOver, setDeadThisNight, enqueueRavenkeeperIfNeeded, killPlayer, nightLogic, moonchildChainPendingRef, handleImpSuicide]);

  // Submit votes handler
  // 规则特例：玩家可以在对自己的提名中投票（规则书中没有提及"不能在自己的提名中投票"）
  // 规则：死亡玩家只能在有投票标记（hasGhostVote）时进行一次处决投票
  const submitVotes = useCallback((v: number, voters?: number[]) => {
    if(currentModal?.type !== 'VOTE_INPUT') return;
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
    const voterListText = voters && voters.length ? ` | 投票者: ${voters.map(id => `${id+1}号`).join('、')}` : '';
    addLog(`${voterId+1}号获得 ${v} 票${v>=threshold ? ' (上台)' : ''}${isDemonVote ? '，恶魔投票' : ''}${voterSeat?.isDead ? '（死亡玩家投票）' : ''}${voterListText}`);
    setVoteInputValue('');
    setShowVoteErrorToast(false);
    setCurrentModal(null);
  }, [currentModal, initialSeats, seats, voteRecords, saveHistory, setTodayDemonVoted, setSeats, addLog, setVoteInputValue, setShowVoteErrorToast, setCurrentModal, setVotedThisRound]);

  // Execute judgment handler
  const executeJudgment = useCallback(() => {
    // 保存历史记录
    saveHistory();
    
    const cands = seats.filter(s=>s.isCandidate).sort((a,b)=>(b.voteCount||0)-(a.voteCount||0));
    if(cands.length===0) { 
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
    if(tops.length > 1) { 
      setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `平票（${tops.length}人并列最高票 ${maxVoteCount}），平安日无人被处决` } });
    } else if(tops.length === 1) {
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
          const msg = `由于茶艺师 ? 能力，${executed.id+1}号是茶艺师的善良邻居，本次处决无效，请重新计票或宣布平安日`;
          addLog(msg);
          setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: msg } });
          return;
        }
      }
      if (executed.role?.id === 'lunatic_mr') {
        executePlayer(executed.id);
        return;
      }
      executePlayer(executed.id);
      // 6. 弹窗公示处决结果
      setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `${executed.id+1}号被处决` } });
    }
  }, [saveHistory, seats, setCurrentModal, getAliveNeighbors, isGoodAlignment, executePlayer, addLog]);

  // Confirm poison handler
  // 重构：使用 roleActionHandlers 的执行逻辑，职责分离
  const confirmPoison = useCallback(() => {
    if(!nightInfo || currentModal?.type !== 'POISON_CONFIRM') return;
    const targetId = currentModal.data.targetId;
    
    executePoisonAction(targetId, false, {
      nightInfo,
      seats,
      setSeats,
      setCurrentModal,
      setSelectedActionTargets,
      continueToNextAction,
      isActorDisabledByPoisonOrDrunk,
      addLogWithDeduplication,
      addPoisonMark,
      computeIsPoisoned,
    });
  }, [currentModal, nightInfo, seats, setSeats, setCurrentModal, setSelectedActionTargets, continueToNextAction, isActorDisabledByPoisonOrDrunk, addLogWithDeduplication, addPoisonMark, computeIsPoisoned, executePoisonAction]);

  // Confirm poison evil handler
  // 重构：使用 roleActionHandlers 的执行逻辑，职责分离
  const confirmPoisonEvil = useCallback(() => {
    if(!nightInfo || currentModal?.type !== 'POISON_EVIL_CONFIRM') return;
    const targetId = currentModal.data.targetId;
    
    executePoisonAction(targetId, true, {
      nightInfo,
      seats,
      setSeats,
      setCurrentModal,
      setSelectedActionTargets,
      continueToNextAction,
      isActorDisabledByPoisonOrDrunk,
      addLogWithDeduplication,
      addPoisonMark,
      computeIsPoisoned,
    });
  }, [currentModal, nightInfo, seats, setSeats, setCurrentModal, setSelectedActionTargets, continueToNextAction, isActorDisabledByPoisonOrDrunk, addLogWithDeduplication, addPoisonMark, computeIsPoisoned, executePoisonAction]);

  // Confirm execution result handler
  const confirmExecutionResult = useCallback(() => {
    if (currentModal?.type !== 'EXECUTION_RESULT') return;
    const isVirginTrigger = currentModal.data.isVirginTrigger;
    setCurrentModal(null);
    
    // 如果是贞洁者触发的处决点击确认后自动进入下一个黑
    if (isVirginTrigger) {
      nightLogic.startNight(false);
      return;
    }

    // BMR：主谋（Mastermind）额外一天的结算
    // 在进入夜晚前裁定胜负：
    // - 若额外一天无人处决 -> 邪恶获胜
    // - 若额外一天发生处决 -> 善良获胜（恶魔已死）
    if (mastermindFinalDay?.active) {
      if (todayExecutedId === null) {
        setWinResult('evil');
        setWinReason('主谋翻盘：额外一天无人处决');
        setGamePhase('gameOver');
        addLog('🧠 主谋翻盘成功：额外一天无人处决，邪恶阵营获胜');
      } else {
        setWinResult('good');
        setWinReason('主谋翻盘失败：额外一天发生处决且恶魔已死');
        setGamePhase('gameOver');
        addLog('🧠 主谋翻盘失败：额外一天发生处决，恶魔已死，善良阵营获胜');
      }
      setMastermindFinalDay(null);
      return;
    }
    
    const cands = seats.filter(s=>s.isCandidate).sort((a,b)=>(b.voteCount||0)-(a.voteCount||0));
    if(cands.length===0) {
      nightLogic.startNight(false);
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
    if(tops.length !== 1) {
      // 平票/无人处决 -> 若为涡流环境邪恶立即胜
      if (isVortoxWorld && todayExecutedId === null) {
        setWinResult('evil');
        setWinReason('涡流白天无人处决');
        setGamePhase('gameOver');
        addLog('涡流在场且今日无人处决邪恶阵营胜利');
        return;
      }
      nightLogic.startNight(false);
    }
  }, [currentModal, setCurrentModal, nightLogic, seats, isVortoxWorld, todayExecutedId, setWinResult, setWinReason, setGamePhase, addLog, mastermindFinalDay, setMastermindFinalDay]);

  // Enter dusk phase handler
  const enterDuskPhase = useCallback(() => {
    // 保存历史记录
    saveHistory();
    // 进入新黄昏时将当前黄昏的处决记录保存为"上一个黄昏的处决记录"
    // 这样送葬者在夜晚时就能看到上一个黄昏的处决信息
    if (currentDuskExecution !== null) {
      setLastDuskExecution(currentDuskExecution);
    } else {
      // 如果当前黄昏没有处决保持上一个黄昏的记录如果有的话
      // 如果上一个黄昏也没有处决lastDuskExecution保持为null
    }
    // 清空当前黄昏的处决记录准备记录新的处决
    setCurrentDuskExecution(null);
    
    // 每个新黄昏开始时，重置“白天有外来者死亡”标记（教父额外杀人仅本夜生效）
    setOutsiderDiedToday(false);
    
    // 清除应在“次日黄昏/下个黄昏”移除的中毒/醉酒等临时状态
    setSeats(prev => prev.map(s => {
      const filteredStatusDetails = (s.statusDetails || []).filter(st => {
        // 永久性标记直接保留
        if (st.includes('永久中毒') || st.includes('永久')) return true;
        // 普卡中毒由夜晚逻辑特殊处理，保留
        if (st.includes('普卡中毒')) return true;

        // 只要描述里包含“黄昏清除”或明确写了“次日黄昏/下个黄昏”，都视为本次黄昏应清理
        if (
          st.includes('次日黄昏清除') ||
          st.includes('下个黄昏清除') ||
          st.includes('至下个黄昏清除') ||
          st.includes('次日黄昏') ||
          st.includes('下个黄昏')
        ) {
          return false;
        }
        return true;
      });
      
      const filteredStatuses = (s.statuses || []).filter(status => {
        // 只要 effect 是 Poison/Drunk 且持续时间里写了“黄昏”相关，视为应在此刻清除
        const isTempPoisonOrDrunk =
          (status.effect === 'Poison' || status.effect === 'Drunk') &&
          (typeof status.duration === 'string') &&
          (
            status.duration.includes('次日黄昏') ||
            status.duration.includes('下个黄昏') ||
            status.duration.includes('黄昏清除') ||
            status.duration === 'Night+Day' ||
            status.duration === '1 Day'
          );
        if (isTempPoisonOrDrunk) return false;
        return true;
      });

      // 侍臣：醉酒 3 天 3 夜（每个新黄昏开始时递减一次）
      const decrementedStatuses = filteredStatuses
        .map((status: any) => {
          if (status.effect === 'Drunk' && status.duration === '侍臣3天3夜' && typeof status.remainingDays === 'number') {
            return { ...status, remainingDays: Math.max(0, status.remainingDays - 1) };
          }
          return status;
        })
        .filter((status: any) => {
          if (status.effect === 'Drunk' && status.duration === '侍臣3天3夜' && typeof status.remainingDays === 'number') {
            return status.remainingDays > 0;
          }
          return true;
        });

      const filteredStatusDetailsWithCourtier = filteredStatusDetails.filter(st => {
        // 若侍臣醉酒已到期，移除对应文本标记
        if (st.includes('侍臣致醉') && !decrementedStatuses.some((x: any) => x.effect === 'Drunk' && x.duration === '侍臣3天3夜')) {
          return false;
        }
        return true;
      });
      
      // 重新计算状态
      const poisonedAfterClean = computeIsPoisoned({
        ...s,
        statusDetails: filteredStatusDetailsWithCourtier,
        statuses: decrementedStatuses,
      });
      // isDrunk：酒鬼本体永远醉；否则只要还有 Drunk 状态或“致醉/醉酒”标记就视为醉
      const drunkAfterClean =
        (s.role?.id === 'drunk') ||
        decrementedStatuses.some((st: any) => st.effect === 'Drunk') ||
        filteredStatusDetailsWithCourtier.some((d) => d.includes('致醉') || d.includes('醉酒'));
      
      return {
        ...s,
        statusDetails: filteredStatusDetailsWithCourtier,
        statuses: decrementedStatuses,
        isPoisoned: poisonedAfterClean,
        isDrunk: drunkAfterClean,
        voteCount: undefined,
        isCandidate: false,
      };
    }));
    
    setGamePhase('dusk');
    // 重置提名记录
    setNominationRecords({ nominators: new Set(), nominees: new Set() });
    setNominationMap({});
    setCurrentModal(null);
  }, [saveHistory, currentDuskExecution, setLastDuskExecution, setCurrentDuskExecution, setGamePhase, setSeats, setNominationRecords, setNominationMap, setCurrentModal, computeIsPoisoned, setOutsiderDiedToday]);

  // Resolve lunatic RPS handler
  const resolveLunaticRps = useCallback((result: 'win' | 'lose' | 'tie') => {
    if (currentModal?.type !== 'LUNATIC_RPS') return;
    const { targetId, nominatorId } = currentModal.data;
    const nominatorNote = nominatorId !== null ? `提名者${nominatorId+1}号` : '';
    if (result === 'lose') {
      addLog(`${targetId+1}号(精神病患者) 在石头剪刀布中落败${nominatorNote}，被处决`);
      executePlayer(targetId, { skipLunaticRps: true });
      setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `${targetId+1}号被处决，石头剪刀布落败` } });
    } else {
      if (nominatorId !== null) {
        addLog(`${targetId+1}号(精神病患者) 在石头剪刀布中获胜或打平，${nominatorNote}提名者被处决`);
        const updatedSeats = seats.map(s => s.id === nominatorId ? { ...s, isDead: true, isSentenced: true } : s);
        setSeats(updatedSeats);
        checkGameOver(updatedSeats, nominatorId);
        setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `${nominatorId+1}号被处决，因精神病患者猜拳获胜` } });
      } else {
        addLog(`${targetId+1}号(精神病患者) 在石头剪刀布中获胜或打平${nominatorNote}，处决取消`);
        setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `${targetId+1}号存活，处决取消` } });
      }
      setSeats(p => p.map(s => ({ ...s, isCandidate: false, voteCount: undefined })));
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
    setSeats(p => p.map(s => s.id === shooterId ? { ...s, hasUsedSlayerAbility: true } : s));
    
    const target = seats.find(s => s.id === targetId);
    if (!target) {
      alert('目标不存在');
      setCurrentModal(null);
      return;
    }
    
    // 对尸体开枪能力被消耗但无效果
    if (target.isDead) {
      addLog(`${shooterId+1}号对${targetId+1}号的尸体开枪未产生效果`);
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
        addLog(`${shooterId+1}号(猎手) 开枪击杀 ${targetId+1}号(恶魔)`);
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
        addLog(`${shooterId+1}号(猎手) 开枪，但由于${shooter.isPoisoned ? '中毒' : '醉酒'}状态，能力失效`);
      } else {
        addLog(`${shooterId+1}号${shooter.role?.id === 'slayer' ? '(猎手)' : ''} 开枪，${targetId+1}号不是恶魔`);
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
      `${seatId+1}号(${demonName}) 攻击市长 ${mayorId+1}号，死亡转移给${redirectTargetId+1}号`,
      seatId,
      demonName
    );

    nightLogic.processDemonKill(redirectTargetId, { skipMayorRedirectCheck: true, mayorId });
    setCurrentModal(null);
    if (moonchildChainPendingRef.current) return;
    continueToNextAction();
  }, [nightInfo, currentModal, nightLogic, setCurrentModal, continueToNextAction, addLogWithDeduplication, moonchildChainPendingRef]);

  const confirmHadesiaKill = useCallback(() => {
    if(!nightInfo || currentModal?.type !== 'HADESIA_KILL_CONFIRM' || currentModal.data.targetIds.length !== 3) return;
    const targetIds = currentModal.data.targetIds;
    
    // 哈迪寂亚三名玩家秘密决定自己的命运如果他们全部存活他们全部死亡
    // 这里简化处理说书人需要手动决定哪些玩家死
    // 所有玩家都会得知哈迪寂亚选择了谁
    const targetNames = targetIds.map(id => `${id+1}号`).join('、');
    const seatId = nightInfo?.seat?.id ?? 0;
    addLog(`${seatId+1}号(哈迪寂亚) 选择${targetNames}，所有玩家都会得知这个选择`);
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
    const seatsToUse = seatsRef.current || seats;
    const isEvilPick = isEvilForWinCondition(target);
    if (isEvilPick) {
      addLog(`${sourceId + 1}号(呆瓜) 选择${target.id + 1}号，邪恶，善良阵营立即失败`);
      setWinResult('evil');
      setWinReason('呆瓜误判');
      setGamePhase('gameOver');
      return;
    }
    addLog(`${sourceId + 1}号(呆瓜) 选择${target.id + 1}号，非邪恶，无事发生`);
    if (onResolve) {
      onResolve(seatsToUse);
    } else {
      checkGameOver(seatsToUse);
    }
  }, [showKlutzChoiceModal, klutzChoiceTarget, seats, seatsRef, isEvilForWinCondition, checkGameOver, setShowKlutzChoiceModal, setKlutzChoiceTarget, setWinResult, setWinReason, setGamePhase, addLog]);

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

    const choiceDesc = baseTargets.map(id => `[${id+1}号${choiceMap[id] === 'die' ? '死' : '生'}]`).join('、');
    addLog(`${nightInfo.seat.id+1}号(${demonName}) 选择${choiceDesc}`);
    if (allChooseLive) {
      addLog(`三名玩家都选择"生"，按规则三人全部死亡`);
    } else if (finalTargets.length > 0) {
      addLog(`选择"生"的玩家${finalTargets.map(x=>`${x+1}号`).join('、')}将立即死亡`);
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
              addLog(`${nightInfo?.seat.id+1 || ''}号(${demonName}) 处决${finalTargets.map(x=>`${x+1}号`).join('、')}`);
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
                        const deadNames = deadThisNight.map(id => `${id+1}号`).join('、');
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
      const resultText = `${targetId+1}号玩家的真实身份：${r.name}${currentHint.isPoisoned || isVortoxWorld ? ' (中毒/醉酒状态，此为假信息)' : ''}`;
      setInspectionResult(resultText);
      setInspectionResultKey(k => k + 1);
      // 记录日志
      addLogWithDeduplication(
        `${nightInfo.seat.id+1}号(守鸦人) 查验 ${targetId+1}号 -> 伪 ${r.name}`,
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
        addLog(`${source.id+1}号提名贞洁者被处决`);
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
        addLog(`${sourceId+1}发起提名触发女巫诅咒立刻死亡`);
        killPlayer(sourceId, { skipGameOverCheck: false, recordNightDeath: false });
        setWitchCursedId(null);
        setWitchActive(false);
        return;
      }
    }
    setNominationMap(prev => ({ ...prev, [id]: sourceId }));
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
        addLog(`提示：${id+1}号贞洁者已在本局被提名过一次，她的能力已经失效，本次提名不会再立即处决提名者`);
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
          setNominationRecords((prev) => ({
            nominators: new Set(prev.nominators).add(sourceId),
            nominees: new Set(prev.nominees).add(id),
          }));

          addLog(`${sourceId + 1}号提名 ${id + 1}号（贞洁者）`);
          addLog(`因为你提名了贞洁者，${sourceId + 1}号被立即处决`);

          const executedPlayer = finalSeats.find((s) => s.id === sourceId);
          // 规则对齐：圣徒在“中毒或醉酒”时能力失效
          if (
            executedPlayer &&
            executedPlayer.role?.id === "saint" &&
            !isActorDisabledByPoisonOrDrunk(executedPlayer)
          ) {
            setWinResult("evil");
            setWinReason("圣徒被处决");
            setGamePhase("gameOver");
            addLog("游戏结束圣徒被处决邪恶胜");
            return;
          }
          if (checkGameOver(finalSeats, sourceId)) {
            return;
          }
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
        setSeats(p => p.map(s => s.id === id ? { ...s, isDead: true } : s));
        addLog(`${sourceId+1}号(魔像) 提名 ${id+1}号，${id+1}号不是恶魔，${id+1}号死亡`);
        const updatedSeats = seats.map(s => s.id === id ? { ...s, isDead: true } : s);
        const executedPlayer = updatedSeats.find(s => s.id === id);
        // 规则对齐：圣徒在“中毒或醉酒”时能力失效
        if (executedPlayer && executedPlayer.role?.id === 'saint' && !isActorDisabledByPoisonOrDrunk(executedPlayer)) {
          setWinResult('evil');
          setWinReason('圣徒被处决');
          setGamePhase('gameOver');
          addLog("游戏结束圣徒被处决邪恶胜");
          return;
        }
        if (checkGameOver(updatedSeats, id)) {
          return;
        }
        setSeats(p => p.map(s => s.id === sourceId ? { ...s, hasUsedSlayerAbility: true } : s));
        return;
      }
      setSeats(p => p.map(s => s.id === sourceId ? { ...s, hasUsedSlayerAbility: true } : s));
    }

    setNominationRecords(prev => ({
      nominators: new Set(prev.nominators).add(sourceId),
      nominees: new Set(prev.nominees).add(id)
    }));
    addLog(`${sourceId+1}号提名 ${id+1}号`); 
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
    if(currentModal?.type !== 'DAY_ACTION') return;
    const {type, sourceId} = currentModal.data; 
    setCurrentModal(null);
    if(type==='nominate') {
      executeNomination(sourceId, id);
    } else if(type==='slayer') {
      // 猎手射击：先弹出选择目标的弹窗
      const shooter = seats.find(s => s.id === sourceId);
      if (!shooter) return;
      if (shooter.hasUsedSlayerAbility) {
        alert('该玩家已经使用过猎手能力了！');
        return;
      }
      if (shooter.isDead) {
        addLog(`${sourceId+1}号已死亡无法开枪`);
        setCurrentModal({ type: 'SHOOT_RESULT', data: { message: "无事发生射手已死亡", isDemonDead: false } });
        return;
      }
      // 弹出选择目标的弹窗
      setCurrentModal({ type: 'SLAYER_SELECT_TARGET', data: { shooterId: sourceId } });
      return;
    } else if(type==='lunaticKill') {
      saveHistory();
      const killer = seats.find(s => s.id === sourceId);
      if (!killer || killer.role?.id !== 'lunatic_mr') return;
      if (hasUsedDailyAbility('lunatic_mr', sourceId)) {
        addLog(`${sourceId+1}号(精神病患者) 尝试再次使用日杀能力但本局每名精神病患者只能日杀一次当前已用完`);
        setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: "精神病患者每局只能日杀一次当前已用完" } });
        return;
      }
      const target = seats.find(s => s.id === id);
      if (!target) return;
      if (target.isDead) {
        addLog(`${sourceId+1}号(精神病患者) 试图在白天杀死 ${id+1}号，但对方已死亡`);
        setCurrentModal({ type: 'EXECUTION_RESULT', data: { message: `${id+1}号已死亡，未产生新的死亡` } });
      } else {
        const updatedSeats = seats.map(s => s.id === id ? { ...s, isDead: true, isSentenced: false } : s);
        setSeats(updatedSeats);
        addLog(`${sourceId+1}号(精神病患者) 在提名前公开杀死 ${id+1}号`);
        checkGameOver(updatedSeats, id);
      }
      markDailyAbilityUsed('lunatic_mr', sourceId);
      addLog(`精神病患者本局的日间击杀能力已经使用完毕，之后不能再发动`);
    }
  }, [currentModal, seats, saveHistory, hasUsedDailyAbility, markDailyAbilityUsed, getRegistrationCached, checkGameOver, executeNomination, addLog, setCurrentModal, setSeats, setWinReason]);

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
    if (!sourceSeat || !sourceSeat.role?.dayMeta) {
      // Seat has no dayMeta, skip
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

    // 1. 标记为已使用
    setSeats(prev => prev.map(s => 
      s.id === sourceSeatId 
        ? { ...s, hasUsedDayAbility: true, hasUsedSlayerAbility: s.role?.id === 'slayer' ? true : s.hasUsedSlayerAbility } 
        : s
    ));

    // 2. 处理效果
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
            alert(`🎯 杀手射击成功！\n${targetSeatId+1}号 [${targetRole?.name || '未知'}] 死亡！`);
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

              changeRole(sourceSeatId, roleId);
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
    const mayorSeat = (seatsRef.current || seats).find(s => s.role?.id === 'mayor' && !s.isDead);
    if (mayorSeat && isActorDisabledByPoisonOrDrunk(mayorSeat)) {
      addLog(`提示：市长处于中毒/醉酒状态，按规则其能力可能失效；若仍宣告获胜，请视为说书人裁定`);
    }
    setWinResult('good');
    setWinReason('3人存活且今日不处决市长能力');
    setGamePhase('gameOver');
    addLog('市长在场且剩人今日选择不处决好人胜利');
  }, [setCurrentModal, setWinResult, setWinReason, setGamePhase, addLog, seats, seatsRef]);

  const handleDayEndTransition = useCallback(() => {
    const aliveCount = seats.filter(s => !s.isDead).length;
    const mayorSeat = seats.find(s => s.role?.id === 'mayor' && !s.isDead);
    // 规则对齐：市长中毒/醉酒时能力失效，不弹“三活提醒”
    if (aliveCount === 3 && mayorSeat && !isActorDisabledByPoisonOrDrunk(mayorSeat)) {
      setCurrentModal({ type: 'MAYOR_THREE_ALIVE', data: null });
      return;
    }
    enterDuskPhase();
  }, [seats, enterDuskPhase, setCurrentModal]);

  const handleRestart = useCallback(() => {
    setCurrentModal({ type: 'RESTART_CONFIRM', data: null });
  }, [setCurrentModal]);

  const handleSwitchScript = useCallback(() => {
    // 如果游戏正在进行不是scriptSelection阶段先结束游戏并保存记录
    if (gamePhase !== 'scriptSelection' && selectedScript) {
      // 添加结束游戏的日志
      const updatedLogs = [...gameLogs, { day: nightCount, phase: gamePhase, message: "说书人结束了游戏" }];
      
      // 立即保存对局记录
      const endTime = new Date();
      const duration = startTime ? Math.floor((endTime.getTime() - startTime.getTime()) / 1000) : timer;
      
      const record: GameRecord = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        scriptName: selectedScript.name,
        startTime: startTime ? startTime.toISOString() : new Date().toISOString(),
        endTime: endTime.toISOString(),
        duration: duration,
        winResult: null, // 说书人结束无胜负结
        winReason: "说书人结束了游戏",
        seats: JSON.parse(JSON.stringify(seats)), // 深拷贝座位信
        gameLogs: updatedLogs // 包含结束日志的完整日
      };
      
      saveGameRecord(record);
    }
    
    // 切换到剧本选择页面
    triggerIntroLoading();
    setGamePhase('scriptSelection');
    setSelectedScript(null);
    setNightCount(1);
    setExecutedPlayerId(null);
    setWakeQueueIds([]);
    setCurrentWakeIndex(0);
    setSelectedActionTargets([]);
    // 注意这里不清空gameLogs保留游戏记录用户可以在复盘时查看
    setWinResult(null);
    setDeadThisNight([]);
    setPukkaPoisonQueue([]); // 清空普卡队列防止旧局状态泄
    setSelectedRole(null);
    setInspectionResult(null);
    setCurrentHint({ isPoisoned: false, guide: "", speak: "" });
    setTimer(0);
    setStartTime(null);
    setHistory([]);
    setWinReason(null);
    hintCacheRef.current.clear();
    drunkFirstInfoRef.current.clear();
    resetRegistrationCache('idle');
    setAutoRedHerringInfo(null);
    setCurrentModal(null);
    setNightOrderPreview([]);
    setPendingNightQueue(null);
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
      hasUsedVirginAbility: false, 
      hasBeenNominated: false,
      isDemonSuccessor: false, 
      hasAbilityEvenDead: false,
      statusDetails: [],
      statuses: [],
      grandchildId: null,
      isGrandchild: false,
      zombuulLives: 1
    })));
    setInitialSeats([]);
  }, [gamePhase, selectedScript, gameLogs, nightCount, startTime, timer, seats, saveGameRecord, triggerIntroLoading, setGamePhase, setSelectedScript, setNightCount, setExecutedPlayerId, setWakeQueueIds, setCurrentWakeIndex, setSelectedActionTargets, setWinResult, setDeadThisNight, setPukkaPoisonQueue, setSelectedRole, setInspectionResult, setCurrentHint, setTimer, setStartTime, setHistory, setWinReason, hintCacheRef, drunkFirstInfoRef, resetRegistrationCache, setAutoRedHerringInfo, setCurrentModal, setNightOrderPreview, setPendingNightQueue, setSeats, setInitialSeats]);

  const handleNewGame = useCallback(() => {
    triggerIntroLoading();
    setGamePhase('scriptSelection');
    setSelectedScript(null);
    setNightCount(1);
    setExecutedPlayerId(null);
    setWakeQueueIds([]);
    setCurrentWakeIndex(0);
    setSelectedActionTargets([]);
    setGameLogs([]);
    setWinResult(null);
    setDeadThisNight([]);
    setSelectedRole(null);
    setInspectionResult(null);
    setCurrentHint({ isPoisoned: false, guide: "", speak: "" });
    setTimer(0);
    setStartTime(null);
    setHistory([]);
    setWinReason(null);
    hintCacheRef.current.clear();
    drunkFirstInfoRef.current.clear();
    resetRegistrationCache('idle');
    setAutoRedHerringInfo(null);
    setCurrentModal(null);
    setNightOrderPreview([]);
    setPendingNightQueue(null);
    setBaronSetupCheck(null);
    setIgnoreBaronSetup(false);
    setShowMinionKnowDemonModal(null);
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
      hasUsedVirginAbility: false, 
      hasBeenNominated: false,
      isDemonSuccessor: false, 
      hasAbilityEvenDead: false,
      statusDetails: [],
      statuses: [],
      grandchildId: null,
      isGrandchild: false,
      zombuulLives: 1
    })));
    setInitialSeats([]);
  }, [triggerIntroLoading, setGamePhase, setSelectedScript, setNightCount, setExecutedPlayerId, setWakeQueueIds, setCurrentWakeIndex, setSelectedActionTargets, setGameLogs, setWinResult, setDeadThisNight, setSelectedRole, setInspectionResult, setCurrentHint, setTimer, setStartTime, setHistory, setWinReason, hintCacheRef, drunkFirstInfoRef, resetRegistrationCache, setAutoRedHerringInfo, setCurrentModal, setNightOrderPreview, setPendingNightQueue, setBaronSetupCheck, setIgnoreBaronSetup, setShowMinionKnowDemonModal, setSeats, setInitialSeats]);

  const handleStepBack = useCallback(() => {
    if (currentWakeIndex > 0) {
      setCurrentWakeIndex(currentWakeIndex - 1);
      // hint 会从缓存中恢复不重新生
    }
    // 如果已经是第一个但还有历史记录可以继续后退到上一个阶
    else if (history.length > 0) {
      const lastState = history[history.length - 1];
      // 如果上一个状态是夜晚阶段恢复并设置到最后一个唤醒索
      if (lastState.gamePhase === gamePhase && lastState.wakeQueueIds.length > 0) {
        setSeats(lastState.seats);
        setGamePhase(lastState.gamePhase);
        setNightCount(lastState.nightCount);
        setExecutedPlayerId(lastState.executedPlayerId);
        setWakeQueueIds(lastState.wakeQueueIds);
        setCurrentWakeIndex(Math.max(0, lastState.wakeQueueIds.length - 1));
        setSelectedActionTargets(lastState.selectedActionTargets);
        setGameLogs(lastState.gameLogs);
        setHistory(prev => prev.slice(0, -1));
      }
    }
  }, [currentWakeIndex, history, gamePhase, setCurrentWakeIndex, setSeats, setGamePhase, setNightCount, setExecutedPlayerId, setWakeQueueIds, setSelectedActionTargets, setGameLogs, setHistory]);

  const handleGlobalUndo = useCallback(() => {
    // 如果选择剧本"页面无
    if (gamePhase === 'scriptSelection') {
      return;
    }
    
    if (history.length === 0) {
      // 如果历史记录为空尝试回选择剧本"页面
      setGamePhase('scriptSelection');
      setSelectedScript(null);
      setNightCount(1);
      setExecutedPlayerId(null);
      setWakeQueueIds([]);
      setCurrentWakeIndex(0);
      setSelectedActionTargets([]);
      setGameLogs([]);
      setWinResult(null);
      setWinReason(null);
      setDeadThisNight([]);
      setSelectedRole(null);
      setInspectionResult(null);
      setCurrentHint({ isPoisoned: false, guide: "", speak: "" });
      setTimer(0);
      setStartTime(null);
      hintCacheRef.current.clear();
      drunkFirstInfoRef.current.clear();
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
        isDemonSuccessor: false, 
        hasAbilityEvenDead: false,
        statusDetails: [],
        statuses: [],
        grandchildId: null,
      isGrandchild: false,
      zombuulLives: 1
      })));
      setInitialSeats([]);
      return;
    }
    
    const lastState = history[history.length - 1];
    setSeats(lastState.seats);
    setGamePhase(lastState.gamePhase);
    setNightCount(lastState.nightCount);
    setExecutedPlayerId(lastState.executedPlayerId);
    setWakeQueueIds(lastState.wakeQueueIds);
    setCurrentWakeIndex(lastState.currentWakeIndex);
    setSelectedActionTargets(lastState.selectedActionTargets);
    setGameLogs(lastState.gameLogs);
    setSelectedScript(lastState.selectedScript); // 恢复选中的剧
    
    // 清除 hint 缓存让信息重新生成符全局上一的需求
    hintCacheRef.current.clear();
    
    // 不恢hint让 useEffect 重新计算这样信息会重新生成
    
    setHistory(prev => prev.slice(0, -1));
  }, [gamePhase, history, hintCacheRef, drunkFirstInfoRef, setGamePhase, setSelectedScript, setNightCount, setExecutedPlayerId, setWakeQueueIds, setCurrentWakeIndex, setSelectedActionTargets, setGameLogs, setWinResult, setWinReason, setDeadThisNight, setSelectedRole, setInspectionResult, setCurrentHint, setTimer, setStartTime, setSeats, setInitialSeats, setHistory]);

  // ===========================
  // Group D: Seat Interaction functions
  // ===========================

  const setHadesiaChoice = useCallback((id: number, choice: 'live' | 'die') => {
    setHadesiaChoices(prev => ({ ...prev, [id]: choice }));
  }, [setHadesiaChoices]);

  /**
   * 右键菜单动作处理（GameModals 中的 contextMenu）
   * 统一把菜单点击翻译成 currentModal 或直接执行动作
   */
  const handleMenuAction = useCallback((action: string) => {
    const seatId = contextMenu?.seatId;
    if (seatId === undefined || seatId === null) return;
    const seat = seats.find(s => s.id === seatId);
    if (!seat) return;

    // 关闭菜单
    setContextMenu(null);

    if (action === 'nominate') {
      setCurrentModal({ type: 'DAY_ACTION', data: { type: 'nominate', sourceId: seatId } });
      return;
    }

    if (action === 'slayer') {
      setCurrentModal({ type: 'DAY_ACTION', data: { type: 'slayer', sourceId: seatId } });
      return;
    }

    if (action === 'damselGuess') {
      setCurrentModal({ type: 'DAMSEL_GUESS', data: { minionId: seatId, targetId: null } });
      return;
    }

    if (action === 'tinker_die') {
      // 修补匠：随时可能死（由说书人裁定）。这里提供“一键现在死亡”的入口。
      if (seat.role?.id !== 'tinker' || seat.isDead) return;
      saveHistory();
      killPlayer(seatId, {
        source: 'ability',
        onAfterKill: () => {
          addLog(`🛠️ ${seatId + 1}号(修补匠) 在说书人裁定下死亡`);
        }
      });
      return;
    }

    if (action === 'gossip_record') {
      // 造谣者：白天记录造谣并裁定真假（若为真，今晚额外死亡）
      if (seat.role?.id !== 'gossip' || seat.isDead) return;
      saveHistory();
      setCurrentModal({ type: 'DAY_ABILITY', data: { roleId: 'gossip', seatId } });
      setDayAbilityForm({ info1: gossipStatementToday || '' });
      return;
    }
  }, [contextMenu, seats, gossipStatementToday, setContextMenu, setCurrentModal, setDayAbilityForm, saveHistory, killPlayer, addLog]);

  const toggleStatus = useCallback((type: string, seatId?: number) => {
    const targetSeatId = seatId ?? contextMenu?.seatId;
    if(targetSeatId === undefined || targetSeatId === null) return;
    
    setSeats(p => {
      let updated;
      if (type === 'redherring') {
        // 检查场上是否存在占卜师
        const hasFortuneTeller = p.some(s => s.role?.id === "fortune_teller");
        const targetSeat = p.find(s => s.id === targetSeatId);
        const isRemoving = targetSeat?.isRedHerring === true;
        
        // 如果尝试添加天敌红罗剎但场上没有占卜师则不允许
        if (!isRemoving && !hasFortuneTeller) {
          return p; // 不进行任何更改
        }
        
        // 场上"红罗唯一选择新的天敌红罗剎时清除其他玩家的标记和图标
        updated = p.map(s => {
          if (s.id === targetSeatId) {
            const details = s.statusDetails || [];
            return {
              ...s,
              isRedHerring: true,
              statusDetails: details.includes("天敌红罗剎")
                ? details
                : [...details, "天敌红罗剎"],
            };
          } else {
            const details = s.statusDetails || [];
            return {
              ...s,
              isRedHerring: false,
              statusDetails: details.filter(d => d !== "天敌红罗剎"),
            };
          }
        });
        
        // 只有在成功设置而不是移除天敌红罗剎时才添加日志
        // 注意这里使用setTimeout是为了在setSeats完成后再添加日志避免在回调中直接调用
        if (!isRemoving) {
          setTimeout(() => {
            addLog(`你将 ${targetSeatId + 1} 号玩家设为本局唯一的天敌红罗剎，占卜师永远视 ta 为邪恶`);
          }, 0);
        }
      } else {
        updated = p.map(s => {
          if (s.id !== targetSeatId) return s;
          if (type === 'dead') {
            if (s.isDead) {
              return reviveSeat(s);
            }
            return { ...s, isDead: true };
          }
          if (type === 'poison') return { ...s, isPoisoned: !s.isPoisoned };
          if (type === 'drunk') return { ...s, isDrunk: !s.isDrunk };
          return s;
        });
      }
      // 8. 恶魔可以死在任意环节，当被标记死亡后游戏立即结束
      if (type === 'dead') {
        // 立即检查游戏结束条件包括存活人数和恶魔死亡
        if (checkGameOver(updated)) {
          return updated;
        }
      }
      return updated;
    });
    if (type === 'dead') {
      const target = seats.find(s => s.id === targetSeatId);
      if (target && target.isDead && ['night','firstNight'].includes(gamePhase)) {
        insertIntoWakeQueueAfterCurrent(target.id);
      }
    }
    setContextMenu(null);
  }, [contextMenu, seats, gamePhase, reviveSeat, checkGameOver, insertIntoWakeQueueAfterCurrent, addLog, setSeats, setContextMenu]);

  // handleSeatClick logic part - extracted for controller
  const onSeatClick = useCallback((id: number) => {
    if(gamePhase==='setup') {
      // 保存操作前的状态到历史记录
      saveHistory();
      if(selectedRole) {
        if(seats.some(s=>s.role?.id===selectedRole.id)) {
          alert("该角色已入座");
          return;
        }
        setSeats(p=>p.map(s=>s.id===id ? {...s,role:selectedRole}:s)); 
        setSelectedRole(null);
      } else {
        setSeats(p=>p.map(s=>s.id===id ? {...s,role:null}:s));
      }
    }
  }, [gamePhase, selectedRole, seats, saveHistory, setSeats, setSelectedRole]);

  // ======================================================================
  //  Targeting Logic - Full implementation with all role-specific rules
  // ======================================================================

  // Check if a target seat should be disabled based on role-specific rules
  // 【小白模式】移除所有点击限制，允许说书人点选任何人（包括已死玩家）
  // 规则特例：
  // 1. 在夜晚选择"任意玩家"时，可以选择自己或已死亡的玩家（如果规则书中没有明确禁止）
  // 2. 恶魔可以攻击一名已死亡的玩家（如果能力允许）
  // 3. 角色的 canSelectSelf 和 canSelectDead 元数据控制选择限制
  const isTargetDisabled = useCallback((targetSeat: Seat): boolean => {
    // 【小白模式】永远不禁用，允许说书人自由选择任何目标
    // 这样可以手动修正错误，比如对已死玩家使用技能、重复击杀等
    // 规则特例：如果规则书中没有提及"不能做某件事情"，那么就可以做这件事情
    return false;
  }, []);

  // Toggle target selection with full role-specific logic
  const toggleTarget = useCallback((targetId: number) => {
    if (!nightInfo) {
      return;
    }
    
    saveHistory();
    
    // 重构：使用 useRoleAction 的 getTargetCount，职责分离
    const isFirstNight = gamePhase === 'firstNight';
    const targetCount = getRoleTargetCount(nightInfo.effectiveRole.id, isFirstNight);
    const maxTargets = targetCount?.max ?? 1;
    
    // Update selected targets
    let newTargets = [...selectedActionTargets];
    if (newTargets.includes(targetId)) {
      // Remove target if already selected
      newTargets = newTargets.filter(t => t !== targetId);
    } else {
      // Add target
      if (maxTargets === 1) {
        // Single target: replace
        newTargets = [targetId];
      } else {
        // Multiple targets: add to queue, remove oldest if at max
        if (newTargets.length >= maxTargets) {
          newTargets.shift();
        }
        newTargets.push(targetId);
      }
    }
    
    setSelectedActionTargets(newTargets);

    // ==========================================================
    // 自动生成“结果类”信息（占卜师等）并显示在控制台
    // ==========================================================
    try {
      const roleId = nightInfo.effectiveRole.id;

      // 占卜师：选满 2 人后立即生成“是/否”结果
      if (roleId === 'fortune_teller') {
        // 未选满则清空结果
        if (newTargets.length !== 2) {
          setInspectionResult(null);
          fakeInspectionResultRef.current = null;
        } else {
          const [aId, bId] = newTargets;
          const a = seats.find(s => s.id === aId);
          const b = seats.find(s => s.id === bId);
          if (a && b) {
            const regA = getRegistrationCached(a, nightInfo.effectiveRole);
            const regB = getRegistrationCached(b, nightInfo.effectiveRole);
            // 官方：占卜师的“是否选中了恶魔”与“天敌红罗剎”是两套概念。
            // - 非涡流世界：选中红罗剎也会得到“是”
            // - 涡流世界：占卜师应只判断“是否选中了恶魔”，然后整体给出错误信息；
            //   也就是说：仅选中红罗剎时，真实应为“否”，涡流则会让其变为“是”。
            const hasDemonSelected =
              !!regA.registersAsDemon ||
              !!regB.registersAsDemon ||
              a.role?.type === 'demon' ||
              b.role?.type === 'demon' ||
              !!a.isDemonSuccessor ||
              !!b.isDemonSuccessor;

            const hasRedHerringSelected = !!a.isRedHerring || !!b.isRedHerring;
            const isYesReal = hasDemonSelected || (!isVortoxWorld && hasRedHerringSelected);

            const realText = isYesReal ? '是' : '否';
            const shouldFake = nightInfo.isPoisoned || isVortoxWorld;
            let shownText = realText;

            if (shouldFake) {
              // 生成并缓存一次假结果，保证同一组选择下展示稳定
              if (!fakeInspectionResultRef.current) {
                fakeInspectionResultRef.current = isYesReal ? '否' : '是';
              }
              shownText = fakeInspectionResultRef.current;
            } else {
              fakeInspectionResultRef.current = null;
            }

            const note = shouldFake ? '（中毒/醉酒/涡流：此为假信息）' : '';
            const resultText = `🔮 占卜师结果：${shownText}${note}`;
            setInspectionResult(resultText);
            setInspectionResultKey(k => k + 1);
          }
        }
      }
    } catch (e) {
      console.warn('[toggleTarget] Failed to compute inspection result:', e);
    }
    
    // Check if actor is disabled by poison/drunk
    const actorSeat = seats.find(s => s.id === nightInfo.seat.id);
    const actorDisabled = isActorDisabledByPoisonOrDrunk(actorSeat, nightInfo.isPoisoned);
    const isActionalAbility = isActionAbility(nightInfo.effectiveRole);
    
    // Log if actor is disabled and this is an action ability
    if (actorDisabled && isActionalAbility) {
      if (newTargets.length > 0) {
        const lastTargetId = newTargets[newTargets.length - 1];
        addLogWithDeduplication(
          `${nightInfo.seat.id ? nightInfo.seat.id + 1 : 0}号(${nightInfo.effectiveRole?.name ?? ''}) 处于中毒/醉酒状态，本夜${lastTargetId+1}号的行动无效，无事发生`,
          nightInfo.seat.id ?? 0,
          nightInfo.effectiveRole?.name ?? ''
        );
      }
      return;
    }
    
    // 重构：toggleTarget 只负责选中目标，不触发弹窗
    // 弹窗逻辑移到 handleConfirmAction 中，在点击确认按钮时检查
  }, [
    nightInfo,
    gamePhase,
    selectedActionTargets,
    seats,
    saveHistory,
    setSelectedActionTargets,
    setInspectionResult,
    setInspectionResultKey,
    getRegistrationCached,
    isVortoxWorld,
    isActorDisabledByPoisonOrDrunk,
    isActionAbility,
    addLogWithDeduplication,
    getRoleTargetCount
  ]);

  // Return all state and handlers needed by the UI
  return {
    // State
    ...gameState,
    
    // Helper functions
    formatTimer,
    getSeatRoleId,
    cleanseSeatStatuses,
    isActionAbility,
    isActorDisabledByPoisonOrDrunk,
    addDrunkMark,
    isEvilForWinCondition,
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
    confirmDrunkCharade,
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
    handleConfirmAction,
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
    
    // Group C: Phase/Control functions
    declareMayorImmediateWin,
    handleDayEndTransition,
    handleRestart,
    handleSwitchScript,
    handleNewGame,
    handleStepBack,
    handleGlobalUndo,
    closeNightOrderPreview,
    confirmNightOrderPreview,
    proceedToFirstNight, // CRITICAL: Synchronous transition to first night
    
    // Group D: Seat Interaction functions
    onSeatClick,
    toggleStatus,
    handleMenuAction,
    setHadesiaChoice,
    
    // Timer control functions
    handleTimerPause,
    handleTimerStart,
    handleTimerReset,
    isTimerRunning,
    
    // Targeting functions
    toggleTarget,
    isTargetDisabled,
    
    // Additional exports
    groupedRoles,
    isGoodAlignment,
    getSeatPosition: getSeatPosition,
    setCompositionError,
    setBaronSetupCheck,
    compositionError,
    baronSetupCheck,
  };
}

