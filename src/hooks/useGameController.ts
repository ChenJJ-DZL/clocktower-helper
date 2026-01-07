"use client";

import { useEffect, useMemo, useCallback, useRef } from "react";
import { roles, Role, Seat, StatusEffect, LogEntry, GamePhase, WinResult, groupedRoles, typeLabels, typeColors, typeBgColors, RoleType, Script } from "../../app/data";
import { NightHintState, NightInfoResult, GameRecord } from "../types/game";
import { useGameState } from "./useGameState";
import { useRoleAction } from "./useRoleAction";
import { useNightLogic } from "./useNightLogic";
import { isRoleRegistered } from "../roles/index";
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
import { calculateNightInfo } from "../utils/nightLogic";

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
  if (!seat.role) return null;
  if (seat.isEvilConverted) return 'demon';
  if (seat.isGoodConverted) return 'townsfolk';
  return seat.role.type;
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

const hasExecutionProof = (seat?: Seat | null): boolean => {
  if (!seat) return false;
  return (seat.statuses || []).some((status) => status.effect === 'ExecutionProof');
};

/**
 * Game Controller Hook
 * Extracts all state management and logic from Home component
 */
export function useGameController() {
  // Get all state from useGameState
  const gameState = useGameState();
  
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
    
    // Modal 状态
    showShootModal, setShowShootModal,
    showNominateModal, setShowNominateModal,
    showDayActionModal, setShowDayActionModal,
    showDayAbilityModal, setShowDayAbilityModal,
    dayAbilityForm, setDayAbilityForm,
    showDrunkModal, setShowDrunkModal,
    baronSetupCheck, setBaronSetupCheck,
    ignoreBaronSetup, setIgnoreBaronSetup,
    compositionError, setCompositionError,
    showVirginTriggerModal, setShowVirginTriggerModal,
    showRavenkeeperFakeModal, setShowRavenkeeperFakeModal,
    showRavenkeeperResultModal, setShowRavenkeeperResultModal,
    showVoteInputModal, setShowVoteInputModal,
    voteInputValue, setVoteInputValue,
    showVoteErrorToast, setShowVoteErrorToast,
    showReviewModal, setShowReviewModal,
    showGameRecordsModal, setShowGameRecordsModal,
    gameRecords, setGameRecords,
    showRoleInfoModal, setShowRoleInfoModal,
    showExecutionResultModal, setShowExecutionResultModal,
    showShootResultModal, setShowShootResultModal,
    showKillConfirmModal, setShowKillConfirmModal,
    showAttackBlockedModal, setShowAttackBlockedModal,
    showMayorRedirectModal, setShowMayorRedirectModal,
    mayorRedirectTarget, setMayorRedirectTarget,
    showMayorThreeAliveModal, setShowMayorThreeAliveModal,
    showPoisonConfirmModal, setShowPoisonConfirmModal,
    showPoisonEvilConfirmModal, setShowPoisonEvilConfirmModal,
    showNightDeathReportModal, setShowNightDeathReportModal,
    showHadesiaKillConfirmModal, setShowHadesiaKillConfirmModal,
    showMoonchildKillModal, setShowMoonchildKillModal,
    showStorytellerDeathModal, setShowStorytellerDeathModal,
    showSweetheartDrunkModal, setShowSweetheartDrunkModal,
    showMinionKnowDemonModal, setShowMinionKnowDemonModal,
    goonDrunkedThisNight, setGoonDrunkedThisNight,
    showPitHagModal, setShowPitHagModal,
    showBarberSwapModal, setShowBarberSwapModal,
    showRangerModal, setShowRangerModal,
    showDamselGuessModal, setShowDamselGuessModal,
    showNightOrderModal, setShowNightOrderModal,
    nightOrderPreview, setNightOrderPreview,
    pendingNightQueue, setPendingNightQueue,
    nightQueuePreviewTitle, setNightQueuePreviewTitle,
    showFirstNightOrderModal, setShowFirstNightOrderModal,
    firstNightOrder, setFirstNightOrder,
    showRestartConfirmModal, setShowRestartConfirmModal,
    poppyGrowerDead, setPoppyGrowerDead,
    showKlutzChoiceModal, setShowKlutzChoiceModal,
    klutzChoiceTarget, setKlutzChoiceTarget,
    lastExecutedPlayerId, setLastExecutedPlayerId,
    damselGuessed, setDamselGuessed,
    shamanKeyword, setShamanKeyword,
    shamanTriggered, setShamanTriggered,
    showShamanConvertModal, setShowShamanConvertModal,
    shamanConvertTarget, setShamanConvertTarget,
    spyDisguiseMode, setSpyDisguiseMode,
    spyDisguiseProbability, setSpyDisguiseProbability,
    showSpyDisguiseModal, setShowSpyDisguiseModal,
    pukkaPoisonQueue, setPukkaPoisonQueue,
    poChargeState, setPoChargeState,
    autoRedHerringInfo, setAutoRedHerringInfo,
    dayAbilityLogs, setDayAbilityLogs,
    damselGuessUsedBy, setDamselGuessUsedBy,
    usedOnceAbilities, setUsedOnceAbilities,
    usedDailyAbilities, setUsedDailyAbilities,
    nominationMap, setNominationMap,
    showLunaticRpsModal, setShowLunaticRpsModal,
    balloonistKnownTypes, setBalloonistKnownTypes,
    balloonistCompletedIds, setBalloonistCompletedIds,
    hadesiaChoices, setHadesiaChoices,
    virginGuideInfo, setVirginGuideInfo,
    showRoleSelectModal, setShowRoleSelectModal,
    voteRecords, setVoteRecords,
    remainingDays, setRemainingDays,
    showMadnessCheckModal, setShowMadnessCheckModal,
    showSaintExecutionConfirmModal, setShowSaintExecutionConfirmModal,
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
  
  // 注意seatsRef 需要同步 seats 状态
  seatsRef.current = seats;

  // Get executeAction from useRoleAction
  const { executeAction } = useRoleAction();

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
    return roleList.filter(r => 
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

  useEffect(() => { 
    setTimer(0); 
  }, [gamePhase]);
  
  useEffect(() => { 
    if(!mounted) return;
    const i = setInterval(() => setTimer(t => t + 1), 1000); 
    return () => clearInterval(i); 
  }, [mounted]);

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
        hasUsedAbility
      );
    }
    return null;
  }, [selectedScript, seats, currentWakeIndex, gamePhase, wakeQueueIds, lastDuskExecution, isEvilWithJudgment, poppyGrowerDead, spyDisguiseMode, spyDisguiseProbability, deadThisNight, balloonistKnownTypes, addLog, nightCount, isVortoxWorld, todayDemonVoted, todayMinionNominated, todayExecutedId, hasUsedAbility]);

  // 检查游戏结束条件
  const checkGameOver = useCallback((updatedSeats: Seat[], executedPlayerIdArg?: number | null, preserveWinReason?: boolean) => {
    // 防御性检查确保updatedSeats不为空且是有效数组
    if (!updatedSeats || updatedSeats.length === 0) {
      console.error('checkGameOver: updatedSeats为空或无效');
      return false;
    }
    
    // 计算存活人数仅统计已分配角色的玩家僵怖假死状态isFirstDeathForZombuul=true但isZombuulTrulyDead=false算作存活
    const aliveSeats = updatedSeats.filter(s => {
      // 确保seat对象有效并且已经分配角色未分配的空座位不计入存活人数
      if (!s || !s.role) return false;
      // 僵怖特殊处理假死状态算作存活
      if (s.role?.id === 'zombuul' && s.isFirstDeathForZombuul && !s.isZombuulTrulyDead) {
        return true;
      }
      return !s.isDead;
    });
    const aliveCount = aliveSeats.length;
    
    // 优先检查当场上仅存2位存活玩家时游戏结束宣布邪恶阵营获胜
    // 这个检查应该优先于其他检查因为这是立即胜利条件
    if (aliveCount <= 2) {
      setWinResult('evil');
      setWinReason(`场上仅存${aliveCount}位存活玩家`);
      setGamePhase('gameOver');
      addLog(`游戏结束：场上仅存${aliveCount}位存活玩家，邪恶阵营获胜`);
      return true;
    }
    
    // 检查当场上所有存活玩家都是邪恶阵营时立即宣布邪恶阵营获胜
    // 注意在胜负条件计算中仅计算爪牙和恶魔隐士永远属于善良阵营
    // 僵怖假死状态应该被算作存活
    if (aliveSeats.length > 0) {
      const allEvil = aliveSeats.every(s => isEvilForWinCondition(s));
      if (allEvil) {
        setWinResult('evil');
        setWinReason('场上所有存活玩家都是邪恶阵营');
        setGamePhase('gameOver');
        addLog(`游戏结束场上所有存活玩家都是邪恶阵营邪恶阵营获胜`);
        return true;
      }
    }

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
        !executedPlayer.isPoisoned &&
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
    if (deadDemon && !aliveDemon) {
      setWinResult('good');
      // 判断是原小恶魔还是小恶魔传位死亡
      // 如果 preserveWinReason 为 true 则不覆盖 winReason比如猎手击杀的情况
      if (!preserveWinReason) {
        if (deadDemon.isDemonSuccessor) {
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
    
    // 如果没有活着的恶魔检查是否有红唇女郎可以继任
    // 注意红唇女郎的变身逻辑主要在 executePlayer 中处理
    // 这里只是检查如果存活玩家数量 < 5 或没有红唇女郎判定好人胜利
    if (!aliveDemon) {
      const scarletWoman = updatedSeats.find(s => 
        s.role?.id === 'scarlet_woman' && !s.isDead && !s.isDemonSuccessor
      );
      // 如果存活玩家数量 < 5 或没有红唇女郎判定好人胜利
      if (aliveCount < 5 || !scarletWoman) {
        setWinResult('good');
        setWinReason('恶魔死亡');
        setGamePhase('gameOver');
        addLog("游戏结束恶魔死亡好人胜利");
        return true;
      }
      // 如果存活玩家数量 >= 5 且有红唇女郎游戏继续红唇女郎的变身在 executePlayer 中处理
    }
    
    const mayorAlive = aliveSeats.some(s => s.role?.id === 'mayor');
    if (aliveCount === 3 && mayorAlive && gamePhase === 'day') {
      setWinResult('good');
      setWinReason('3人存活且无人被处决，市长能力');
      setGamePhase('gameOver');
      addLog("因为场上只剩 3 名存活玩家且今天无人被处决，市长触发能力，好人立即获胜");
      return true;
    }
    
    return false;
  }, [addLog, gamePhase, evilTwinPair, executedPlayerId, setWinResult, setWinReason, setGamePhase]);

  // 继续到下一个夜晚行动
  const continueToNextAction = useCallback(() => {
    // 保存历史记录
    saveHistory();
    
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
          setShowMinionKnowDemonModal({ demonSeatId: demonSeat.id });
          return;
        }
      }
    }
    
    if(currentWakeIndex < wakeQueueIds.length - 1) { 
      setCurrentWakeIndex(p => p + 1); 
      setInspectionResult(null);
      setSelectedActionTargets([]);
      fakeInspectionResultRef.current = null;
    } else {
      // 夜晚结束显示死亡报告
      // 检测夜晚期间死亡的玩家通过deadThisNight记录
      if(deadThisNight.length > 0) {
        const deadNames = deadThisNight.map(id => `${id+1}号`).join('、');
        setShowNightDeathReportModal(`昨晚${deadNames}玩家死亡`);
      } else {
        setShowNightDeathReportModal("昨天是个平安夜");
      }
    }
  }, [saveHistory, seats, deadThisNight, wakeQueueIds, currentWakeIndex, gamePhase, nightInfo, poppyGrowerDead, setCurrentWakeIndex, setInspectionResult, setSelectedActionTargets, setWakeQueueIds, setShowMinionKnowDemonModal, setShowNightDeathReportModal]);

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
      setShowNightDeathReportModal(`昨晚${deadNames}玩家死亡`);
    } else {
      setShowNightDeathReportModal("昨天是个平安夜");
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

  type KillPlayerOptions = {
    recordNightDeath?: boolean;
    keepInWakeQueue?: boolean;
    seatTransformer?: (seat: Seat) => Seat;
    skipGameOverCheck?: boolean;
    executedPlayerId?: number | null;
    onAfterKill?: (latestSeats: Seat[]) => void;
  };

  // 杀死玩家
  const killPlayer = useCallback(
    (targetId: number, options: KillPlayerOptions = {}) => {
      const seatsSnapshot = seatsRef.current || seats;
      const targetSeat = seatsSnapshot.find(s => s.id === targetId);
      if (!targetSeat) return;
      const killerRoleId = nightInfo?.effectiveRole.id;

      // 茶艺师动态保护实时计算邻座是否提供保护
      if (hasTeaLadyProtection(targetSeat, seatsSnapshot)) {
        addLog(`${targetId + 1}被茶艺师保护未死亡`);
        setShowAttackBlockedModal({
          targetId,
          reason: '茶艺师保护',
          demonName: nightInfo ? getDemonDisplayName(nightInfo.effectiveRole.id, nightInfo.effectiveRole.name) : undefined,
        });
        return;
      }

      const {
        recordNightDeath = true,
        keepInWakeQueue = false,
        seatTransformer,
        skipGameOverCheck,
        executedPlayerId = null,
        onAfterKill,
      } = options;

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
          setShowBarberSwapModal({ demonId: demon.id, firstId: null, secondId: null });
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
          console.error('killPlayer finalize: seatsToUse为空或无效，跳过游戏结束检查');
          onAfterKill?.(seatsToUse || []);
          return;
        }

        const finalSeats = seatsToUse;

        // 诺-达杀人后邻近两名镇民中毒永久直到游戏结束
        if (killerRoleId === 'no_dashii') {
          const neighbors = getAliveNeighbors(finalSeats, targetId).filter(s => s.role?.type === 'townsfolk');
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

        // 方古若杀死外来者且未转化过则目标变恶魔自己死亡
        if (killerRoleId === 'fang_gu' && !fangGuConverted) {
          const targetRole = targetSeat.role;
          const isOutsider = targetRole?.type === 'outsider';
          if (isOutsider) {
            const fangGuRole = roles.find(r => r.id === 'fang_gu');
            setSeats(p => p.map(s => {
              if (s.id === targetId) {
                return cleanseSeatStatuses({ ...s, role: fangGuRole || s.role, isDemonSuccessor: false });
              }
              if (s.id === (nightInfo?.seat?.id ?? 0)) {
                return { ...s, isDead: true };
              }
              return s;
            }));
            setFangGuConverted(true);
            if (nightInfo?.seat.id !== undefined) {
              const seatId = nightInfo?.seat?.id ?? 0;
              addLog(`${seatId+1}号(方古) 杀死外来者，目标转化为方古，原方古死亡`);
            }
            onAfterKill?.(finalSeats);
            return;
          }
        }

        if (!shouldSkipGameOver) {
          moonchildChainPendingRef.current = false;
          checkGameOver(finalSeats, executedPlayerId);
        }
        onAfterKill?.(finalSeats);
      };

      if (targetSeat.role?.id === 'klutz' && !targetSeat.isDead && !(targetSeat.statusDetails || []).includes('呆瓜已触发')) {
        setShowKlutzChoiceModal({
          sourceId: targetId,
          onResolve: finalize,
        });
        addLog(`${targetId + 1}号(呆瓜) 死亡必须选择一名存活玩家`);
        return;
      }

      if (targetSeat.role?.id === 'sweetheart') {
        setShowSweetheartDrunkModal({
          sourceId: targetId,
          onResolve: finalize,
        });
        addLog(`${targetId + 1}号(心上人) 死亡将导致一名玩家今晚至次日黄昏醉酒`);
        return;
      }

      if (targetSeat.role?.id === 'moonchild') {
        moonchildChainPendingRef.current = true;
        setShowMoonchildKillModal({
          sourceId: targetId,
          onResolve: finalize,
        });
        return;
      }

      finalize(updatedSeats);
    },
    [seats, nightInfo, enqueueRavenkeeperIfNeeded, checkGameOver, hasTeaLadyProtection, getDemonDisplayName, fangGuConverted, addLog, setSeats, setWakeQueueIds, setDeadThisNight, setShowAttackBlockedModal, setShowBarberSwapModal, setShowKlutzChoiceModal, setShowSweetheartDrunkModal, setShowMoonchildKillModal, setFangGuConverted]
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
      nightInfo,
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
      setShowNightOrderModal,
      setPendingNightQueue,
      setNightOrderPreview,
      setNightQueuePreviewTitle,
      setShowNightDeathReportModal,
      setShowKillConfirmModal,
      setShowMayorRedirectModal,
      setShowAttackBlockedModal,
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
    setShowNightDeathReportModal(null);
    
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
    // 使用seatsRef确保获取最新的seats状态然后检查游戏结束条件
    const currentSeats = seatsRef.current;
    // 检查游戏结束条件包括存活人数
    if (checkGameOver(currentSeats)) {
      return;
    }
    setGamePhase("day");
  }, [seats, deadThisNight, poppyGrowerDead, cleanStatusesForNewDay, addLog, checkGameOver, setSeats, setShowNightDeathReportModal, setPoppyGrowerDead, setDeadThisNight, setGamePhase]);

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
    const compact = active.map((s, i) => ({ ...s, id: i }));

    setTimeout(() => {
      const withRed = [...compact];
      const hasFortuneTeller = withRed.some(s => s.role?.id === "fortune_teller");
      if (hasFortuneTeller && !withRed.some(s => s.isRedHerring)) {
        const good = withRed.filter(s => ["townsfolk","outsider"].includes(s.role?.type || ""));
        if (good.length > 0) {
          const t = getRandom(good);
          withRed[t.id] = { 
            ...withRed[t.id], 
            isRedHerring: true, 
            statusDetails: [...(withRed[t.id].statusDetails || []), "红罗刹"] 
          };
          const redRoleName = withRed[t.id].role?.name || '未知角色';
          addLog(`红罗刹分配${t.id+1}号：${redRoleName}`);
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

  // 确认酒鬼伪装角色选择
  const confirmDrunkCharade = useCallback((role: Role) => {
    if (showDrunkModal === null) return;
    const seatId = showDrunkModal;
    setSeats(prev => prev.map(s => {
      if (s.id === seatId && s.role?.id === 'drunk') {
        return { ...s, charadeRole: role };
      }
      return s;
    }));
    setShowDrunkModal(null);
    addLog(`${seatId + 1}号(酒鬼) 伪装为 ${role.name}`);
  }, [showDrunkModal, setSeats, setShowDrunkModal, addLog]);

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
  }, [getCompositionStatus, setCompositionError]);

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

  // ======================================================================
  //  Modal and Action Handlers - Moved from page.tsx
  // ======================================================================
  
  // Handle confirm action for night actions
  const handleConfirmAction = useCallback(() => {
    if(!nightInfo) return;
    
    // ===========================
    //      新架构：优先检查角色注册表
    // ===========================
    // 1. 获取当前正在行动的角色ID
    const currentRoleId = nightInfo.effectiveRole.id;
    
    // 2. 检查该角色是否已迁移到新架构
    if (currentRoleId && isRoleRegistered(currentRoleId)) {
      console.log(`[NewArch] Role ${currentRoleId} handled by generic system.`);
      
      // 执行通用逻辑
      const result = executeAction({
        currentSeats: seats,
        roleId: currentRoleId,
        performerId: nightInfo.seat.id,
        targetIds: selectedActionTargets,
        gamePhase,
        nightCount,
      });
      
      if (result) {
        // 应用结果
        if (result.nextSeats) {
          setSeats(result.nextSeats);
        }
        
        // 记录日志
        if (result.logs) {
          if (result.logs.publicLog) {
            addLog(result.logs.publicLog);
          }
          if (result.logs.privateLog) {
            addLog(result.logs.privateLog);
          }
          // secretInfo 可以用于后续的玩家信息显示
          if (result.logs.secretInfo) {
            // 如果需要显示给玩家，可以在这里处理
            // 例如：setInspectionResult(result.logs.secretInfo);
          }
        }
        
        // 清空选中的目标
        setSelectedActionTargets([]);
        
        // 继续流程
        continueToNextAction();
        
        // ⛔️ 拦截旧逻辑，直接返回
        return;
      }
    }
    
    // ===========================
    //      旧架构：继续执行原有逻辑
    // ===========================
    // 麻脸巫婆选择玩家与目标角色进行变
    if (nightInfo.effectiveRole.id === 'pit_hag_mr') {
      if (selectedActionTargets.length !== 1) return;
      const targetId = selectedActionTargets[0];
      if (!showPitHagModal) {
        setShowPitHagModal({ targetId, roleId: null });
        return;
      }
      if (!showPitHagModal.roleId) return;
      const targetSeat = seats.find(s => s.id === targetId);
      const newRole = roles.find(r => r.id === showPitHagModal.roleId);
      if (!targetSeat || !newRole) return;
      // 不能变成场上已存在的角色
      const roleAlreadyInPlay = seats.some(s => getSeatRoleId(s) === newRole.id);
      if (roleAlreadyInPlay) {
        alert('该角色已在场上，无法变身为已存在角色');
        return;
      }

      setSeats(prev => prev.map(s => {
        if (s.id !== targetId) return s;
        const cleaned = cleanseSeatStatuses({
          ...s,
          isDemonSuccessor: false,
          // 保留僵怖真实死亡标记其他死亡/中毒状态全部清
          isZombuulTrulyDead: s.isZombuulTrulyDead,
        }, { keepDeathState: true });
        const nextSeat = { ...cleaned, role: newRole, charadeRole: null };
        if (s.hasAbilityEvenDead) {
          addLog(`${s.id+1}号因亡骨魔获得的"死而有能"效果在变身${newRole.name} 时已失效`);
        }
        return nextSeat;
      }));

      const createdNewDemon = newRole.type === 'demon' && targetSeat?.role?.type !== 'demon';
      // 如果创造了新的恶魔提示说书人决定当晚死亡
      if (createdNewDemon) {
        const seatId = nightInfo?.seat?.id ?? 0;
        addLog(`${seatId+1}号(麻脸巫婆) ${targetId+1}号变为恶魔，今晚的死亡由说书人决定`);
      } else {
        const seatId = nightInfo?.seat?.id ?? 0;
        addLog(`${seatId+1}号(麻脸巫婆) ${targetId+1}号变为 ${newRole?.name ?? ''}`);
      }

      // 动态调整唤醒队列让目标在本夜后续按照行动顺序被唤
      insertIntoWakeQueueAfterCurrent(targetId, { roleOverride: newRole, logLabel: `${targetId+1}号(${newRole.name})` });

      setShowPitHagModal(null);
      setSelectedActionTargets([]);

      if (createdNewDemon) {
        setShowStorytellerDeathModal({ sourceId: targetId });
        return;
      }

      continueToNextAction();
      return;
    }
    // 如果有待确认的弹窗杀死 ? 投毒/哈迪寂亚/守鸦人假身份选择/月之 : 理发师等未处理则不继
    if (showKillConfirmModal !== null || showPoisonConfirmModal !== null || showPoisonEvilConfirmModal !== null || showHadesiaKillConfirmModal !== null || 
        showRavenkeeperFakeModal !== null || showMoonchildKillModal !== null || showBarberSwapModal !== null || showStorytellerDeathModal !== null || showSweetheartDrunkModal !== null || showKlutzChoiceModal !== null) {
      return;
    }
    // 教授夜半狂欢一次性复活一名死亡玩
    if (nightInfo.effectiveRole.id === 'professor_mr' && gamePhase !== 'firstNight') {
      const seatId = nightInfo?.seat?.id ?? 0;
      if (hasUsedAbility('professor_mr', seatId)) {
        continueToNextAction();
        return;
      }
      const availableReviveTargets = seats.filter(s => {
        const r = s.role?.id === 'drunk' ? s.charadeRole : s.role;
        return s.isDead && r && r.type === 'townsfolk' && !s.isDemonSuccessor;
      });
      if (availableReviveTargets.length === 0) {
        addLog(`${seatId+1}号(教授) 无可复活的镇民，跳过`);
        continueToNextAction();
        return;
      }
      if (selectedActionTargets.length !== 1) {
        return; // 需选择一名死亡玩
      }
      const targetId = selectedActionTargets[0];
      const targetSeat = seats.find(s => s.id === targetId);
      if (!targetSeat || !targetSeat.isDead) return;
      const targetRole = targetSeat.role?.id === 'drunk' ? targetSeat.charadeRole : targetSeat.role;
      if (!targetRole || targetSeat.isDemonSuccessor || targetRole.type !== 'townsfolk') {
        alert('教授只能复活死亡的镇民');
        return;
      }
      const hadEvenDead = !!targetSeat.hasAbilityEvenDead;
      // 复活清理死中毒相关状
      setSeats(prev => prev.map(s => {
        if (s.id !== targetId) return s;
        return reviveSeat({
          ...s,
          isEvilConverted: false,
          isZombuulTrulyDead: s.isZombuulTrulyDead, // 保留僵怖真实死亡标
        });
      }));
      // 移除普卡队列中的目标
      setPukkaPoisonQueue(prev => prev.filter(entry => entry.targetId !== targetId));
      setDeadThisNight(prev => prev.filter(id => id !== targetId));
      addLog(`${seatId+1}号(教授) 复活${targetId+1}号`);
      if (hadEvenDead) {
        addLog(`${targetId+1}号此前因亡骨魔获得的"死而有能"效果随着复活已失效`);
      }
      markAbilityUsed('professor_mr', seatId);
      setSelectedActionTargets([]);
      insertIntoWakeQueueAfterCurrent(targetId, { logLabel: `${targetId+1}号(复活)` });
      continueToNextAction();
      return;
    }
    // 巡山人命中落难少女则变成未在场镇民
    if (nightInfo.effectiveRole.id === 'ranger' && gamePhase !== 'firstNight') {
      const seatId = nightInfo?.seat?.id ?? 0;
      if (hasUsedAbility('ranger', seatId)) {
        continueToNextAction();
        return;
      }
      if (selectedActionTargets.length !== 1) return;
      const targetId = selectedActionTargets[0];
      const targetSeat = seats.find(s => s.id === targetId);
      if (!targetSeat || targetSeat.isDead) return;
      const targetRoleId = getSeatRoleId(targetSeat);
      markAbilityUsed('ranger', seatId);
      setSelectedActionTargets([]);
      if (targetRoleId !== 'damsel') {
        addLog(`${seatId+1}号(巡山人) 选择${targetId+1}号，但未命中落难少女`);
        continueToNextAction();
        return;
      }
      setShowRangerModal({ targetId, roleId: null });
      return;
    }

    // 沙巴洛斯每晚选择两名玩家杀死暂不实现复活效果
    if (nightInfo.effectiveRole.id === 'shabaloth' && gamePhase !== 'firstNight') {
      if (selectedActionTargets.length !== 2) return;
      const targets = [...selectedActionTargets];
      setSelectedActionTargets([]);
      let remaining = targets.length;
      targets.forEach((tid, idx) => {
        killPlayer(tid, {
          skipGameOverCheck: idx < targets.length - 1,
          onAfterKill: () => {
            remaining -= 1;
            if (remaining === 0) {
              const seatId = nightInfo?.seat?.id ?? 0;
              addLog(`${seatId+1}号(沙巴洛斯) 杀死了 ${targets.map(x=>`${x+1}号`).join('、')}，本工具暂未实现其复活效果，请说书人按规则手动裁定是否复活`);
              continueToNextAction();
            }
          }
        });
      });
      return;
    }

    // 珀支持本夜不杀死蓄力与下夜三连杀死
    if (nightInfo.effectiveRole.id === 'po' && gamePhase !== 'firstNight') {
      const seatId = nightInfo?.seat?.id ?? 0;
      const charged = poChargeState[seatId] === true;
      const uniqueTargets = Array.from(new Set(selectedActionTargets));

      // 未蓄力允许0个目标0=本夜不杀死蓄力=普通杀一
      if (!charged) {
        if (uniqueTargets.length > 1) return;
        if (uniqueTargets.length === 0) {
          // 本夜不杀人蓄力
          setPoChargeState(prev => ({ ...prev, [seatId]: true }));
          addLog(`${seatId+1}号(珀) 本夜未杀人，蓄力一次，下一个夜晚将爆发杀 3 人`);
          continueToNextAction();
          return;
        }
        const targetId = uniqueTargets[0];
        setPoChargeState(prev => ({ ...prev, [seatId]: false }));
        setSelectedActionTargets([]);
        killPlayer(targetId, {
          onAfterKill: () => {
            addLog(`${seatId+1}号(珀) 杀死了 ${targetId+1}号`);
            continueToNextAction();
          }
        });
        return;
      }

      // 已蓄力必须选择3名不同目标本夜爆发杀 3 
      if (uniqueTargets.length !== 3) return;
      setPoChargeState(prev => ({ ...prev, [seatId]: false }));
      setSelectedActionTargets([]);
      let remaining = uniqueTargets.length;
      uniqueTargets.forEach((tid, idx) => {
        killPlayer(tid, {
          skipGameOverCheck: idx < uniqueTargets.length - 1,
          onAfterKill: () => {
            remaining -= 1;
            if (remaining === 0) {
              addLog(`${seatId+1}号(珀) 爆发杀死了 ${uniqueTargets.map(x=>`${x+1}号`).join('、')}`);
              continueToNextAction();
            }
          }
        });
      });
      return;
    }

    // 旅店老板确认两名目标给予保护并随机致醉一
    if (nightInfo.effectiveRole.id === 'innkeeper' && gamePhase !== 'firstNight') {
      if (selectedActionTargets.length !== 2) return;
      const [aId, bId] = selectedActionTargets;
      setSelectedActionTargets([]);
      const drunkTargetId = Math.random() < 0.5 ? aId : bId;
      setSeats(prev => prev.map(s => {
        if (s.id === aId || s.id === bId) {
          const seatId = nightInfo?.seat?.id ?? 0;
          const base = { ...s, isProtected: true, protectedBy: seatId };
          if (s.id === drunkTargetId) {
            const clearTime = '次日黄昏';
            const { statusDetails, statuses } = addDrunkMark(base, 'innkeeper', clearTime);
            const nextSeat = { ...base, statusDetails, statuses };
            return { ...nextSeat, isDrunk: true };
          }
          return base;
        }
        return s;
      }));
      const seatId = nightInfo?.seat?.id ?? 0;
      addLog(`${seatId+1}号(旅店老板) 今晚保护${aId+1}号、${bId+1}号，他们不会被恶魔杀死，其中一人醉酒到下个黄昏，信息可能错误`);
      continueToNextAction();
      return;
    }
    
    // 检查是否有待确认的操作投毒者和恶魔的确认弹窗已在toggleTarget中处理
    // 如果有打开的确认弹窗不继续流
    if(showKillConfirmModal !== null || showPoisonConfirmModal !== null || showPoisonEvilConfirmModal !== null || showHadesiaKillConfirmModal !== null || 
       showRavenkeeperFakeModal !== null || showMoonchildKillModal !== null || showSweetheartDrunkModal !== null || showKlutzChoiceModal !== null) {
      return;
    }
    
    // 没有待确认的操作继续流
    continueToNextAction();
  }, [nightInfo, seats, selectedActionTargets, gamePhase, nightCount, executeAction, isRoleRegistered, showPitHagModal, setShowPitHagModal, setSeats, cleanseSeatStatuses, getSeatRoleId, roles, insertIntoWakeQueueAfterCurrent, setSelectedActionTargets, continueToNextAction, setShowStorytellerDeathModal, showKillConfirmModal, showPoisonConfirmModal, showPoisonEvilConfirmModal, showHadesiaKillConfirmModal, showRavenkeeperFakeModal, showMoonchildKillModal, showBarberSwapModal, showStorytellerDeathModal, showSweetheartDrunkModal, showKlutzChoiceModal, hasUsedAbility, reviveSeat, setPukkaPoisonQueue, setDeadThisNight, markAbilityUsed, addLog, setShowRangerModal, killPlayer, poChargeState, setPoChargeState, addDrunkMark]);

  // Execute player (execution logic)
  const executePlayer = useCallback((id: number, options?: { skipLunaticRps?: boolean; forceExecution?: boolean }) => {
    const seatsSnapshot = seatsRef.current || seats;
    const t = seatsSnapshot.find(s => s.id === id);
    if (!t) return;
    const skipLunaticRps = options?.skipLunaticRps;
    const forceExecution = options?.forceExecution;

    // 圣徒处决前强提醒未确认时不继续后续逻辑
    if (t.role?.id === 'saint' && !forceExecution) {
      setShowSaintExecutionConfirmModal({ targetId: id, skipLunaticRps });
      return;
    }

    if (t.role?.id === 'lunatic_mr' && !skipLunaticRps) {
      const nominatorId = nominationMap[id] ?? null;
      setShowLunaticRpsModal({ targetId: id, nominatorId });
      setShowExecutionResultModal({ message: `${id+1}号等待石头剪刀布决定生死` });
      return;
    }

    // 茶艺师动态保护邻座善良茶艺师保护的善良玩家无法被处
    if (hasTeaLadyProtection(t, seatsSnapshot)) {
      addLog(`${id+1}被茶艺师保护处决无效`);
      setExecutedPlayerId(id);
      setCurrentDuskExecution(id);
      return;
    }
    
    // 魔鬼代言人保护当日处决免疫
    if (hasExecutionProof(t)) {
      addLog(`${id+1}受到魔鬼代言人保护处决无效`);
      setExecutedPlayerId(id);
      setCurrentDuskExecution(id);
      return;
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
    if (t?.role?.id === 'saint' && !t.isPoisoned) {
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
      
      // 主谋特殊处理如果主谋在游戏开始时存活且恶魔在首夜被处决邪恶阵营获
      if (gamePhase === 'firstNight') {
        const mastermind = seatsSnapshot.find(s => 
          s.role?.id === 'mastermind' && !s.isDead
        );
        if (mastermind) {
          setSeats(newSeats);
          addLog(`${id+1}被处决`);
          setExecutedPlayerId(id);
          setCurrentDuskExecution(id);
          setWinResult('evil');
          setWinReason('主谋恶魔在首夜被处决');
          setGamePhase('gameOver');
          addLog(`游戏结束主谋在场恶魔在首夜被处决邪恶阵营获胜`);
          return;
        }
      }
      
      // 计算处决后的存活玩家数量
      const aliveCount = newSeats.filter(s => !s.isDead).length;
      
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
            return s;
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
      
      // 如果不满足红唇女郎变身条件判定好人胜利
      setSeats(newSeats);
      addLog(`${id+1}号(${t.role?.name || '小恶魔'}) 被处决`);
      setWinResult('good');
      setWinReason(`${t.role?.name || '小恶魔'}被处决`);
      setGamePhase('gameOver');
      addLog("游戏结束，恶魔被处决，好人胜利");
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
    // 10. 记录当前黄昏的处决用于送葬者
    // 这个记录会在进入下一个黄昏时更新为lastDuskExecution
    setCurrentDuskExecution(id);
    
    // 立即检查游戏结束条件包括存活人数和恶魔死亡
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
    if(!nightInfo || showKillConfirmModal === null) return;
    const targetId = showKillConfirmModal;
    const impSeat = nightInfo.seat;
    
    // 如果当前执行杀人能力的角色本身中毒/醉酒则本次夜间攻击应视为无事发生
    const actorSeat = seats.find(s => s.id === nightInfo?.seat?.id);
    if (isActorDisabledByPoisonOrDrunk(actorSeat, nightInfo.isPoisoned)) {
      addLogWithDeduplication(
        `${nightInfo?.seat?.id ? nightInfo.seat.id + 1 : 0}号(${nightInfo?.effectiveRole?.name ?? ''}) 处于中毒/醉酒状态，本夜对${targetId+1}号的攻击无效，无事发生`,
        nightInfo.seat.id,
        nightInfo.effectiveRole.name
      );
      setShowKillConfirmModal(null);
      setSelectedActionTargets([]);
      continueToNextAction();
      return;
    }
    
    // 如果小恶魔选择自己触发身份转移或自杀结算
    if (targetId === impSeat.id && nightInfo.effectiveRole.id === 'imp') {
      // 找到所有活着的爪
      const aliveMinions = seats.filter(s => 
        s.role?.type === 'minion' && 
        !s.isDead && 
        s.id !== impSeat.id
      );
      
      if (aliveMinions.length > 0) {
        // 随机选择一个爪牙作为新的小恶魔
        const newImp = getRandom(aliveMinions);
        const newImpRole = roles.find(r => r.id === 'imp');
        
        let updatedSeats: Seat[] = [];
        setSeats(p => {
          updatedSeats = p.map(s => {
            if (s.id === impSeat.id) {
              // 原小恶魔死亡
              return { ...s, isDead: true };
            } else if (s.id === newImp.id) {
              // 新小恶魔标记为恶魔继任者更新角色为小恶魔添小恶魔传"标记
              const statusDetails = [...(s.statusDetails || []), '小恶魔传'];
              return { 
                ...s, 
                role: newImpRole || s.role,
                isDemonSuccessor: true,
                statusDetails: statusDetails
              };
            }
            return s;
          });
          
          // 从唤醒队列中移除已死亡的原小恶魔
          setWakeQueueIds(prev => prev.filter(id => id !== impSeat.id));
          
          return updatedSeats;
        });
        
        // 正常传位给爪牙小恶魔自杀时优先传位给爪牙不检查红唇女郎
        // 检查游戏结束不应该结束因为新小恶魔还在
        setTimeout(() => {
          const currentSeats = seatsRef.current || updatedSeats;
          checkGameOver(currentSeats);
        }, 0);
        
        if (nightInfo) {
          addLogWithDeduplication(
            `${impSeat.id+1}号(小恶魔) 选择自己，身份转移给 ${newImp.id+1}号(${newImp.role?.name})，${impSeat.id+1}号已在夜晚死亡`,
            impSeat.id,
            '小恶魔'
          );
          
          // 显眼的高亮提示提醒说书人唤醒新恶魔玩家
          console.warn('%c 重要提醒小恶魔传位成功 ', 'color: #FFD700; font-size: 20px; font-weight: bold; background: #1a1a1a; padding: 10px; border: 3px solid #FFD700;');
          console.warn(`%c请立即唤醒${newImp.id+1}号玩家，向其出示"你是小恶魔"卡牌`, 'color: #FF6B6B; font-size: 16px; font-weight: bold; background: #1a1a1a; padding: 8px;');
          console.warn(`%c注意新恶魔今晚不行动从下一夜开始才会进入唤醒队列`, 'color: #4ECDC4; font-size: 14px; background: #1a1a1a; padding: 5px;');
        }
        
        // 记录原小恶魔的死
        setDeadThisNight(p => [...p, impSeat.id]);
        enqueueRavenkeeperIfNeeded(impSeat.id);
      } else {
        // 如果没有活着的爪牙小恶魔自杀但无法传位直接死亡结算游戏
        addLogWithDeduplication(
          `${impSeat.id+1}号(小恶魔) 选择自己但场上无爪牙可传位，${impSeat.id+1}号直接死亡`,
          impSeat.id,
          '小恶魔'
        );
        // 使用通用杀人流程触发死亡与游戏结束判定
        killPlayer(impSeat.id, {
          onAfterKill: (latestSeats) => {
            const finalSeats = latestSeats && latestSeats.length ? latestSeats : (seatsRef.current || seats);
            checkGameOver(finalSeats, impSeat.id);
          }
        });
        setShowKillConfirmModal(null);
        return;
      }
    } else {
      const result = nightLogic.processDemonKill(targetId);
      if (result === 'pending') return;
    }
    setShowKillConfirmModal(null);
    if (moonchildChainPendingRef.current) return;
    continueToNextAction();
  }, [nightInfo, showKillConfirmModal, seats, isActorDisabledByPoisonOrDrunk, addLogWithDeduplication, setShowKillConfirmModal, setSelectedActionTargets, continueToNextAction, getRandom, roles, setSeats, setWakeQueueIds, seatsRef, checkGameOver, setDeadThisNight, enqueueRavenkeeperIfNeeded, killPlayer, nightLogic, moonchildChainPendingRef]);

  // Submit votes handler
  const submitVotes = useCallback((v: number) => {
    if(showVoteInputModal===null) return;
    
    // 验证票数必须是自然数>=1且不超过开局时的玩家
    const initialPlayerCount = initialSeats.length > 0 
      ? initialSeats.filter(s => s.role !== null).length 
      : seats.filter(s => s.role !== null).length;
    
    // 验证票数范围
    if (isNaN(v) || v < 1 || !Number.isInteger(v)) {
      alert(`票数必须是自然数大于等的整数`);
      return;
    }
    
    if (v > initialPlayerCount) {
      alert(`票数不能超过开局时的玩家数${initialPlayerCount}人`);
      return;
    }
    
    // 保存历史记录
    saveHistory();
    
    // 记录投票者是否为恶魔用于卖花女孩
    const voteRecord = voteRecords.find(r => r.voterId === showVoteInputModal);
    const isDemonVote = voteRecord?.isDemon || false;
    if (isDemonVote) {
      setTodayDemonVoted(true);
    }
    
    const alive = seats.filter(s=>!s.isDead).length;
    const threshold = Math.ceil(alive/2);
    // 票数达到50%才会上处决台
    setSeats(p=>p.map(s=>s.id===showVoteInputModal ? {...s,voteCount:v,isCandidate:v>=threshold}:s));
    addLog(`${showVoteInputModal+1}号获得 ${v} 票${v>=threshold ? ' (上台)' : ''}${isDemonVote ? '，恶魔投票' : ''}`);
    setVoteInputValue('');
    setShowVoteErrorToast(false);
    setShowVoteInputModal(null);
  }, [showVoteInputModal, initialSeats, seats, voteRecords, saveHistory, setTodayDemonVoted, setSeats, addLog, setVoteInputValue, setShowVoteErrorToast, setShowVoteInputModal]);

  // Execute judgment handler
  const executeJudgment = useCallback(() => {
    // 保存历史记录
    saveHistory();
    
    const cands = seats.filter(s=>s.isCandidate).sort((a,b)=>(b.voteCount||0)-(a.voteCount||0));
    if(cands.length===0) { 
      // 6. 弹窗公示处决结果
      setShowExecutionResultModal({ message: "无人上台无人被处决" });
      return; 
    }
    const max = cands[0].voteCount || 0;
    const alive = seats.filter(s=>!s.isDead).length;
    const threshold = Math.ceil(alive/2);
    
    // 只有票数最高的才会被处决即使有多人上台
    const tops = cands.filter(c => c.voteCount === max && (c.voteCount || 0) >= threshold);
    if(tops.length>1) { 
      // 6. 弹窗公示处决结果
      setShowExecutionResultModal({ message: "平票平安日无人被处决" });
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
          setShowExecutionResultModal({ message: msg });
          return;
        }
      }
      if (executed.role?.id === 'lunatic_mr') {
        executePlayer(executed.id);
        return;
      }
      executePlayer(executed.id);
      // 6. 弹窗公示处决结果
      setShowExecutionResultModal({ message: `${executed.id+1}号被处决` });
    } else {
      // 6. 弹窗公示处决结果
      setShowExecutionResultModal({ message: `最高票 : ${max} 未达到半${threshold}无人被处决` });
    }
  }, [saveHistory, seats, setShowExecutionResultModal, getAliveNeighbors, isGoodAlignment, executePlayer, addLog]);

  // Confirm poison handler
  const confirmPoison = useCallback(() => {
    const targetId = showPoisonConfirmModal;
    if(!nightInfo || targetId === null) return;
    
    // 如果投毒者本身中醉酒则本次下毒应视为无事发生
    const actorSeat = seats.find(s => s.id === nightInfo?.seat?.id);
    if (isActorDisabledByPoisonOrDrunk(actorSeat, nightInfo.isPoisoned)) {
      addLogWithDeduplication(
        `${nightInfo.seat.id+1}号(投毒者) 处于中毒/醉酒状态，本夜对${targetId+1}号的下毒无效，无事发生`,
        nightInfo.seat.id,
        '投毒者'
      );
      setShowPoisonConfirmModal(null);
      setSelectedActionTargets([]);
      continueToNextAction();
      return;
    }
    
    // 注意保留永久中毒标记舞蛇人制造和亡骨魔中毒标记
    setSeats(p => p.map(s => {
      if (s.id === targetId) {
        // 投毒者当晚和明天白天中毒在次日黄昏清除
        const clearTime = '次日黄昏';
        const { statusDetails, statuses } = addPoisonMark(s, 
          nightInfo.effectiveRole.id === 'poisoner_mr' ? 'poisoner_mr' : 'poisoner', 
          clearTime
        );
        const nextSeat = { ...s, statusDetails, statuses };
        return { ...nextSeat, isPoisoned: computeIsPoisoned(nextSeat) };
      }
      return { ...s, isPoisoned: computeIsPoisoned(s) };
    }));
    addLogWithDeduplication(
      `${nightInfo.seat.id+1}号(投毒者) 对 ${targetId+1}号下毒`,
      nightInfo.seat.id,
      '投毒者'
    );
    setShowPoisonConfirmModal(null);
    setSelectedActionTargets([]);
    continueToNextAction();
  }, [showPoisonConfirmModal, nightInfo, seats, isActorDisabledByPoisonOrDrunk, addLogWithDeduplication, setShowPoisonConfirmModal, setSelectedActionTargets, continueToNextAction, setSeats, addPoisonMark, computeIsPoisoned]);

  // Confirm poison evil handler
  const confirmPoisonEvil = useCallback(() => {
    const targetId = showPoisonEvilConfirmModal;
    if(!nightInfo || targetId === null) return;
    
    // 如果投毒者本身中醉酒则本次下毒应视为无事发生
    const actorSeat = seats.find(s => s.id === nightInfo?.seat?.id);
    if (isActorDisabledByPoisonOrDrunk(actorSeat, nightInfo.isPoisoned)) {
      addLogWithDeduplication(
        `${nightInfo.seat.id+1}号(投毒者) 处于中毒/醉酒状态，本夜对${targetId+1}号(队友)的下毒无效，无事发生`,
        nightInfo.seat.id,
        '投毒者'
      );
      setShowPoisonEvilConfirmModal(null);
      setSelectedActionTargets([]);
      continueToNextAction();
      return;
    }
    
    // 注意保留永久中毒标记舞蛇人制造和亡骨魔中毒标记
    setSeats(p => p.map(s => {
      if (s.id === targetId) {
        // 投毒者当晚和明天白天中毒在次日黄昏清
        const clearTime = '次日黄昏';
        const { statusDetails, statuses } = addPoisonMark(s, 
          nightInfo.effectiveRole.id === 'poisoner_mr' ? 'poisoner_mr' : 'poisoner', 
          clearTime
        );
        const nextSeat = { ...s, statusDetails, statuses };
        return { ...nextSeat, isPoisoned: computeIsPoisoned(nextSeat) };
      }
      return { ...s, isPoisoned: computeIsPoisoned(s) };
    }));
    addLogWithDeduplication(
      `${nightInfo.seat.id+1}号(投毒者) 对 ${targetId+1}号(队友)下毒`,
      nightInfo.seat.id,
      '投毒者'
    );
    setShowPoisonEvilConfirmModal(null);
    setSelectedActionTargets([]);
    continueToNextAction();
  }, [showPoisonEvilConfirmModal, nightInfo, seats, isActorDisabledByPoisonOrDrunk, addLogWithDeduplication, setShowPoisonEvilConfirmModal, setSelectedActionTargets, continueToNextAction, setSeats, addPoisonMark, computeIsPoisoned]);

  // Confirm execution result handler
  const confirmExecutionResult = useCallback(() => {
    const isVirginTrigger = showExecutionResultModal?.isVirginTrigger;
    setShowExecutionResultModal(null);
    
    // 如果是贞洁者触发的处决点击确认后自动进入下一个黑
    if (isVirginTrigger) {
      nightLogic.startNight(false);
      return;
    }
    
    const cands = seats.filter(s=>s.isCandidate).sort((a,b)=>(b.voteCount||0)-(a.voteCount||0));
    if(cands.length===0) {
      nightLogic.startNight(false);
      return;
    }
    const max = cands[0].voteCount || 0;
    const alive = seats.filter(s=>!s.isDead).length;
    const threshold = Math.ceil(alive/2);
    const tops = cands.filter(c => c.voteCount === max && (c.voteCount || 0) >= threshold);
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
  }, [showExecutionResultModal, setShowExecutionResultModal, nightLogic, seats, isVortoxWorld, todayExecutedId, setWinResult, setWinReason, setGamePhase, addLog]);

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
    setGamePhase('dusk');
    // 重置所有提名状态允许重新提名
    setSeats(p => p.map(s => ({...s, voteCount: undefined, isCandidate: false})));
    // 重置提名记录
    setNominationRecords({ nominators: new Set(), nominees: new Set() });
    setNominationMap({});
    setShowMayorThreeAliveModal(false);
  }, [saveHistory, currentDuskExecution, setLastDuskExecution, setCurrentDuskExecution, setGamePhase, setSeats, setNominationRecords, setNominationMap, setShowMayorThreeAliveModal]);

  // Resolve lunatic RPS handler
  const resolveLunaticRps = useCallback((result: 'win' | 'lose' | 'tie') => {
    if (!showLunaticRpsModal) return;
    const { targetId, nominatorId } = showLunaticRpsModal;
    const nominatorNote = nominatorId !== null ? `提名者${nominatorId+1}号` : '';
    if (result === 'lose') {
      addLog(`${targetId+1}号(精神病患者) 在石头剪刀布中落败${nominatorNote}，被处决`);
      executePlayer(targetId, { skipLunaticRps: true });
      setShowExecutionResultModal({ message: `${targetId+1}号被处决，石头剪刀布落败` });
    } else {
      if (nominatorId !== null) {
        addLog(`${targetId+1}号(精神病患者) 在石头剪刀布中获胜或打平，${nominatorNote}提名者被处决`);
        const updatedSeats = seats.map(s => s.id === nominatorId ? { ...s, isDead: true, isSentenced: true } : s);
        setSeats(updatedSeats);
        checkGameOver(updatedSeats, nominatorId);
        setShowExecutionResultModal({ message: `${nominatorId+1}号被处决，因精神病患者猜拳获胜` });
      } else {
        addLog(`${targetId+1}号(精神病患者) 在石头剪刀布中获胜或打平${nominatorNote}，处决取消`);
        setShowExecutionResultModal({ message: `${targetId+1}号存活，处决取消` });
      }
      setSeats(p => p.map(s => ({ ...s, isCandidate: false, voteCount: undefined })));
      setNominationRecords({ nominators: new Set(), nominees: new Set() });
      setNominationMap({});
    }
    setShowLunaticRpsModal(null);
  }, [showLunaticRpsModal, executePlayer, addLog, seats, setSeats, checkGameOver, setShowExecutionResultModal, setNominationRecords, setNominationMap, setShowLunaticRpsModal]);

  // Confirm shoot result handler
  const confirmShootResult = useCallback(() => {
    setShowShootResultModal(null);
    // 如果恶魔死亡游戏已经结束不需要额外操
    // 如果无事发生继续游戏流
  }, [setShowShootResultModal]);

  // ===========================
  // Group A: Confirm functions
  // ===========================
  
  const confirmMayorRedirect = useCallback((redirectTargetId: number | null) => {
    if (!nightInfo || !showMayorRedirectModal) return;
    const mayorId = showMayorRedirectModal.targetId;
    const demonName = showMayorRedirectModal.demonName;

    setShowMayorRedirectModal(null);

    if (redirectTargetId === null) {
      // 不转移市长自己死亡
      nightLogic.processDemonKill(mayorId, { skipMayorRedirectCheck: true });
      setShowKillConfirmModal(null);
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
    setShowKillConfirmModal(null);
    if (moonchildChainPendingRef.current) return;
    continueToNextAction();
  }, [nightInfo, showMayorRedirectModal, nightLogic, setShowMayorRedirectModal, setShowKillConfirmModal, continueToNextAction, addLogWithDeduplication, moonchildChainPendingRef]);

  const confirmHadesiaKill = useCallback(() => {
    if(!nightInfo || !showHadesiaKillConfirmModal || showHadesiaKillConfirmModal.length !== 3) return;
    const targetIds = showHadesiaKillConfirmModal;
    
    // 哈迪寂亚三名玩家秘密决定自己的命运如果他们全部存活他们全部死亡
    // 这里简化处理说书人需要手动决定哪些玩家死
    // 所有玩家都会得知哈迪寂亚选择了谁
    const targetNames = targetIds.map(id => `${id+1}号`).join('、');
    const seatId = nightInfo?.seat?.id ?? 0;
    addLog(`${seatId+1}号(哈迪寂亚) 选择${targetNames}，所有玩家都会得知这个选择`);
    addLog(`请说书人决定 ${targetNames} 的命运如果他们全部存活他们全部死亡`);
    
    // 这里需要说书人手动处理暂时只记录日志
    setShowHadesiaKillConfirmModal(null);
    setSelectedActionTargets([]);
    continueToNextAction();
  }, [nightInfo, showHadesiaKillConfirmModal, setShowHadesiaKillConfirmModal, setSelectedActionTargets, continueToNextAction, addLog]);

  const confirmMoonchildKill = useCallback((targetId: number) => {
    if (!showMoonchildKillModal) return;
    const { sourceId, onResolve } = showMoonchildKillModal;
    setShowMoonchildKillModal(null);

    const targetSeat = seats.find(s => s.id === targetId);
    const isGood = targetSeat?.role && ['townsfolk', 'outsider'].includes(targetSeat.role.type);

    if (isGood) {
      addLog(`${sourceId + 1}号(月之子) 选择 ${targetId + 1}号与其陪葬，善良今晚死亡`);
      killPlayer(targetId, {
        onAfterKill: latestSeats => {
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
    if (!showStorytellerDeathModal) return;
    const sourceId = showStorytellerDeathModal.sourceId;
    setShowStorytellerDeathModal(null);

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
  }, [showStorytellerDeathModal, killPlayer, continueToNextAction, addLog, setShowStorytellerDeathModal]);

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
          onAfterKill: (latestSeats) => {
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
                        setShowNightDeathReportModal(`昨晚${deadNames}玩家死亡`);
                      } else {
                        setShowNightDeathReportModal("昨天是个平安夜");
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
    const { targetId, skipLunaticRps } = showSaintExecutionConfirmModal;
    setShowSaintExecutionConfirmModal(null);
    executePlayer(targetId, { skipLunaticRps, forceExecution: true });
  }, [showSaintExecutionConfirmModal, executePlayer, setShowSaintExecutionConfirmModal]);

  const cancelSaintExecution = useCallback(() => {
    setShowSaintExecutionConfirmModal(null);
  }, [setShowSaintExecutionConfirmModal]);

  const confirmRavenkeeperFake = useCallback((r: Role) => {
    // 选择假身份后在控制台显示假身份
    const targetId = showRavenkeeperFakeModal;
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
    setShowRavenkeeperFakeModal(null);
  }, [showRavenkeeperFakeModal, nightInfo, currentHint, isVortoxWorld, setInspectionResult, setInspectionResultKey, addLogWithDeduplication, setShowRavenkeeperFakeModal]);

  const confirmVirginTrigger = useCallback(() => {
    if (!showVirginTriggerModal) return;
    const { source, target } = showVirginTriggerModal;
    // 使用 hasBeenNominated 而不hasUsedVirginAbility
    if (target.role?.id === 'virgin' && !target.hasBeenNominated && !target.isPoisoned) {
      setSeats(p => {
        const newSeats = p.map(s => 
          s.id === source.id ? { ...s, isDead: true } : 
          s.id === target.id ? { ...s, hasBeenNominated: true, hasUsedVirginAbility: true } : s
        );
        addLog(`${source.id+1}号提名贞洁者被处决`);
        checkGameOver(newSeats);
        return newSeats;
      });
      setShowVirginTriggerModal(null);
    } else {
      setShowVirginTriggerModal(null);
    }
  }, [showVirginTriggerModal, checkGameOver, setSeats, addLog, setShowVirginTriggerModal]);

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

  const executeNomination = useCallback((sourceId: number, id: number, options?: { virginGuideOverride?: { isFirstTime: boolean; nominatorIsTownsfolk: boolean } }) => {
    // 8. 检查提名限
    if (nominationRecords.nominators.has(sourceId)) {
      addLog(`系统限制每名玩家每天只能发起一次提名这是为了减少混乱不是官方规则的一部分`);
      return;
    }
    if (nominationRecords.nominees.has(id)) {
      addLog(`系统限制每名玩家每天只能被提名一次这是为了减少混乱不是官方规则的一部分`);
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
    const nominatorSeat = seats.find(s => s.id === sourceId);
    if (nominatorSeat?.role?.type === 'minion') {
      setTodayMinionNominated(true);
    }

    const target = seats.find(s => s.id === id);
    const virginOverride = options?.virginGuideOverride;

    // 贞洁者处女逻辑处理
    if (target?.role?.id === 'virgin' && !target.isPoisoned) {
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
          const finalSeats = updatedSeats.map(s =>
            s.id === sourceId ? { ...s, isDead: true } : s
          );
          setSeats(finalSeats);
          addLog(`${sourceId+1}号提名 ${id+1}号`);
          addLog(`${sourceId+1}号提名贞洁者被处决`);
          const executedPlayer = finalSeats.find(s => s.id === sourceId);
          if (executedPlayer && executedPlayer.role?.id === 'saint' && !executedPlayer.isPoisoned) {
            setWinResult('evil');
            setWinReason('圣徒被处决');
            setGamePhase('gameOver');
            addLog("游戏结束圣徒被处决邪恶胜");
            return;
          }
          if (checkGameOver(finalSeats, sourceId)) {
            return;
          }
          setShowExecutionResultModal({ message: `${sourceId+1}号玩家被处决`, isVirginTrigger: true });
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
        if (executedPlayer && executedPlayer.role?.id === 'saint' && !executedPlayer.isPoisoned) {
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
    setShowVoteInputModal(id);
  }, [nominationRecords, seats, witchActive, witchCursedId, killPlayer, checkGameOver, getRegistrationCached, addLog, setNominationMap, setTodayMinionNominated, setVirginGuideInfo, setSeats, setWinResult, setWinReason, setGamePhase, setShowExecutionResultModal, setNominationRecords, setVoteInputValue, setShowVoteErrorToast, setShowVoteInputModal, setWitchCursedId, setWitchActive]);

  const handleVirginGuideConfirm = useCallback(() => {
    if (!virginGuideInfo) return;
    executeNomination(virginGuideInfo.nominatorId, virginGuideInfo.targetId, {
      virginGuideOverride: {
        isFirstTime: virginGuideInfo.isFirstTime,
        nominatorIsTownsfolk: virginGuideInfo.nominatorIsTownsfolk
      }
    });
    setVirginGuideInfo(null);
    setShowDayActionModal(null);
    setShowNominateModal(null);
    setShowShootModal(null);
  }, [virginGuideInfo, executeNomination, setVirginGuideInfo, setShowDayActionModal, setShowNominateModal, setShowShootModal]);

  const handleDayAction = useCallback((id: number) => {
    if(!showDayActionModal) return;
    const {type, sourceId} = showDayActionModal; 
    setShowDayActionModal(null);
    if(type==='nominate') {
      executeNomination(sourceId, id);
    } else if(type==='lunaticKill') {
      saveHistory();
      const killer = seats.find(s => s.id === sourceId);
      if (!killer || killer.role?.id !== 'lunatic_mr') return;
      if (hasUsedDailyAbility('lunatic_mr', sourceId)) {
        addLog(`${sourceId+1}号(精神病患者) 尝试再次使用日杀能力但本局每名精神病患者只能日杀一次当前已用完`);
        setShowExecutionResultModal({ message: "精神病患者每局只能日杀一次当前已用完" });
        return;
      }
      const target = seats.find(s => s.id === id);
      if (!target) return;
      if (target.isDead) {
        addLog(`${sourceId+1}号(精神病患者) 试图在白天杀死 ${id+1}号，但对方已死亡`);
        setShowExecutionResultModal({ message: `${id+1}号已死亡，未产生新的死亡` });
      } else {
        const updatedSeats = seats.map(s => s.id === id ? { ...s, isDead: true, isSentenced: false } : s);
        setSeats(updatedSeats);
        addLog(`${sourceId+1}号(精神病患者) 在提名前公开杀死 ${id+1}号`);
        checkGameOver(updatedSeats, id);
      }
      markDailyAbilityUsed('lunatic_mr', sourceId);
      addLog(`精神病患者本局的日间击杀能力已经使用完毕，之后不能再发动`);
    } else if(type==='slayer') {
      // 开枪可以在任意环节但只有健康猎手选中恶魔才有
      const shooter = seats.find(s => s.id === sourceId);
      if (!shooter || shooter.hasUsedSlayerAbility) return;
      // 死亡的猎手不能开枪
      if (shooter.isDead) {
        addLog(`${sourceId+1}号已死亡无法开枪`);
        setShowShootResultModal({ message: "无事发生射手已死亡", isDemonDead: false });
        return;
      }
      
      const target = seats.find(s => s.id === id);
      if (!target) return;
      
      // 标记为已使用开枪能力
      setSeats(p => p.map(s => s.id === sourceId ? { ...s, hasUsedSlayerAbility: true } : s));
      
      // 对尸体开枪能力被消耗但无效果
      if (target.isDead) {
        addLog(`${sourceId+1}号对${id+1}号的尸体开枪未产生效果`);
        setShowShootResultModal({ message: "无事发生目标已死亡", isDemonDead: false });
        return;
      }
      
      // 只有健康状态的真正猎手选中恶魔才有
      const isRealSlayer = shooter.role?.id === 'slayer' && !shooter.isPoisoned && !shooter.isDead;
      const targetRegistration = getRegistrationCached(target, shooter.role);
      const isDemon = targetRegistration.registersAsDemon;
      
      if (isRealSlayer && isDemon) {
        // 恶魔死亡游戏立即结
        setSeats(p => {
          const newSeats = p.map(s => s.id === id ? { ...s, isDead: true } : s);
          addLog(`${sourceId+1}号(猎手) 开枪击杀 ${id+1}号(小恶魔)`);
          addLog(`猎手的子弹击中了恶魔，按照规则游戏立即结束，不再进行今天的处决和后续夜晚`);
          // 先设置胜利原因然后调用 checkGameOver 并保存 winReason
          setWinReason('猎手击杀恶魔');
          checkGameOver(newSeats, undefined, true);
          return newSeats;
        });
        // 显示弹窗恶魔死亡
        setShowShootResultModal({ message: "恶魔死亡", isDemonDead: true });
      } else {
        addLog(`${sourceId+1}号${shooter.role?.id === 'slayer' ? '(猎手)' : ''} 开枪，${id+1}号不是恶魔或开枪者不是健康猎手`);
        // 显示弹窗无事发生
        setShowShootResultModal({ message: "无事发生", isDemonDead: false });
      }
    }
  }, [showDayActionModal, seats, saveHistory, hasUsedDailyAbility, markDailyAbilityUsed, getRegistrationCached, checkGameOver, executeNomination, addLog, setShowDayActionModal, setSeats, setShowExecutionResultModal, setShowShootResultModal, setWinReason]);

  const handleDayAbilityTrigger = useCallback((seat: Seat, config: DayAbilityConfig) => {
    if (!seat.role || seat.isDead) return;
    if (config.usage === 'once' && hasUsedAbility(config.roleId, seat.id)) return;
    if (config.usage === 'daily' && hasUsedDailyAbility(config.roleId, seat.id)) return;
    saveHistory();
    if (config.actionType === 'lunaticKill') {
      setShowDayActionModal({ type: 'lunaticKill', sourceId: seat.id });
      return;
    }
    // 交互式日间能力需要弹窗输确认
    if (['savant_mr', 'amnesiac', 'fisherman', 'engineer'].includes(config.roleId)) {
      setShowDayAbilityModal({ roleId: config.roleId, seatId: seat.id });
      setDayAbilityForm({});
      return;
    }
    addLog(config.logMessage(seat));
    if (config.usage === 'once') {
      markAbilityUsed(config.roleId, seat.id);
    } else {
      markDailyAbilityUsed(config.roleId, seat.id);
    }
  }, [hasUsedAbility, hasUsedDailyAbility, saveHistory, markAbilityUsed, markDailyAbilityUsed, addLog, setShowDayActionModal, setShowDayAbilityModal, setDayAbilityForm]);

  // ===========================
  // Group C: Phase/Control functions
  // ===========================

  const declareMayorImmediateWin = useCallback(() => {
    setShowMayorThreeAliveModal(false);
    setWinResult('good');
    setWinReason('3人存活且今日不处决市长能力');
    setGamePhase('gameOver');
    addLog('市长在场且剩人今日选择不处决好人胜利');
  }, [setShowMayorThreeAliveModal, setWinResult, setWinReason, setGamePhase, addLog]);

  const handleDayEndTransition = useCallback(() => {
    const aliveCount = seats.filter(s => !s.isDead).length;
    const mayorAlive = seats.some(s => s.role?.id === 'mayor' && !s.isDead);
    if (aliveCount === 3 && mayorAlive) {
      setShowMayorThreeAliveModal(true);
      return;
    }
    enterDuskPhase();
  }, [seats, enterDuskPhase, setShowMayorThreeAliveModal]);

  const handleRestart = useCallback(() => {
    setShowRestartConfirmModal(true);
  }, [setShowRestartConfirmModal]);

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
    setShowNightOrderModal(false);
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
  }, [gamePhase, selectedScript, gameLogs, nightCount, startTime, timer, seats, saveGameRecord, triggerIntroLoading, setGamePhase, setSelectedScript, setNightCount, setExecutedPlayerId, setWakeQueueIds, setCurrentWakeIndex, setSelectedActionTargets, setWinResult, setDeadThisNight, setPukkaPoisonQueue, setSelectedRole, setInspectionResult, setCurrentHint, setTimer, setStartTime, setHistory, setWinReason, hintCacheRef, drunkFirstInfoRef, resetRegistrationCache, setAutoRedHerringInfo, setShowNightOrderModal, setNightOrderPreview, setPendingNightQueue, setSeats, setInitialSeats]);

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
    setShowNightOrderModal(false);
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
  }, [triggerIntroLoading, setGamePhase, setSelectedScript, setNightCount, setExecutedPlayerId, setWakeQueueIds, setCurrentWakeIndex, setSelectedActionTargets, setGameLogs, setWinResult, setDeadThisNight, setSelectedRole, setInspectionResult, setCurrentHint, setTimer, setStartTime, setHistory, setWinReason, hintCacheRef, drunkFirstInfoRef, resetRegistrationCache, setAutoRedHerringInfo, setShowNightOrderModal, setNightOrderPreview, setPendingNightQueue, setBaronSetupCheck, setIgnoreBaronSetup, setShowMinionKnowDemonModal, setSeats, setInitialSeats]);

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
        
        // 如果尝试添加红罗刹但场上没有占卜师则不允许
        if (!isRemoving && !hasFortuneTeller) {
          return p; // 不进行任何更改
        }
        
        // 场上"红罗唯一选择新的红罗刹时清除其他玩家的红罗刹标记和图标
        updated = p.map(s => {
          if (s.id === targetSeatId) {
            const details = s.statusDetails || [];
            return {
              ...s,
              isRedHerring: true,
              statusDetails: details.includes("红罗刹")
                ? details
                : [...details, "红罗刹"],
            };
          } else {
            const details = s.statusDetails || [];
            return {
              ...s,
              isRedHerring: false,
              statusDetails: details.filter(d => d !== "红罗刹"),
            };
          }
        });
        
        // 只有在成功设置而不是移除红罗刹时才添加日志
        // 注意这里使用setTimeout是为了在setSeats完成后再添加日志避免在回调中直接调用
        if (!isRemoving) {
          setTimeout(() => {
            addLog(`你将 ${targetSeatId + 1} 号玩家设为本局唯一的红罗刹，占卜师永远视 ta 为邪恶`);
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
  const isTargetDisabled = useCallback((targetSeat: Seat): boolean => {
    if (!nightInfo) return true;
    
    const roleId = nightInfo.effectiveRole.id;
    const actorSeatId = nightInfo.seat.id;
    
    // Check if demon action is disabled
    if (nightInfo.effectiveRole.type === 'demon') {
      const act = nightInfo.action || '';
      if (gamePhase === 'firstNight' && !act.includes('杀死')) return true;
      if (['跳过', '无信息', '展示'].some(k => act.includes(k))) return true;
    }
    
    // Monk: Cannot target self
    if (roleId === 'monk' && targetSeat.id === actorSeatId) return true;
    
    // Poisoner: Cannot target dead players
    if (roleId === 'poisoner' && targetSeat.isDead) return true;
    
    // Ravenkeeper: Can only target if they died tonight
    if (roleId === 'ravenkeeper') {
      if (actorSeatId === undefined || !deadThisNight.includes(actorSeatId)) {
        return true; // Disable all targets if ravenkeeper didn't die tonight
      }
    }
    
    // Evil Twin: First night restrictions - only townsfolk/outsider
    if (roleId === 'evil_twin' && gamePhase === 'firstNight') {
      if (!targetSeat.role) return true;
      if (targetSeat.role.type !== 'townsfolk' && targetSeat.role.type !== 'outsider') {
        return true;
      }
    }
    
    // Imp: Cannot target on first night
    if (roleId === 'imp' && gamePhase === 'firstNight') return true;
    
    // Butler: Cannot target self
    if (roleId === 'butler' && targetSeat.id === actorSeatId) return true;
    
    // Chambermaid: Cannot target self
    if (roleId === 'chambermaid' && targetSeat.id === actorSeatId) return true;
    
    // Professor (MR): Can only revive dead townsfolk, and only if ability not used
    if (roleId === 'professor_mr') {
      if (hasUsedAbility('professor_mr', actorSeatId)) return true;
      const targetRole = targetSeat.role?.id === 'drunk' ? targetSeat.charadeRole : targetSeat.role;
      if (!targetSeat.isDead) return true;
      if (!targetRole || targetRole.type !== 'townsfolk') return true;
    }
    
    return false;
  }, [nightInfo, gamePhase, deadThisNight, hasUsedAbility, seats]);

  // Toggle target selection with full role-specific logic
  const toggleTarget = useCallback((targetId: number) => {
    if (!nightInfo) return;
    
    saveHistory();
    
    // Determine max targets based on role
    let maxTargets = 1;
    if (nightInfo.effectiveRole.id === 'fortune_teller') maxTargets = 2;
    if (nightInfo.effectiveRole.id === 'hadesia' && gamePhase !== 'firstNight') maxTargets = 3;
    if (nightInfo.effectiveRole.id === 'seamstress') maxTargets = 2;
    
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
    
    // Handle poisoner confirmation - show modal for evil targets
    if (nightInfo.effectiveRole.id === 'poisoner' && newTargets.length === 1) {
      const targetSeat = seats.find(s => s.id === newTargets[0]);
      if (targetSeat && isEvil(targetSeat)) {
        setShowPoisonEvilConfirmModal(newTargets[0]);
        return;
      }
      // For non-evil targets, show regular poison confirmation
      if (targetSeat && !targetSeat.isDead) {
        setShowPoisonConfirmModal(newTargets[0]);
        return;
      }
    }
  }, [
    nightInfo,
    gamePhase,
    selectedActionTargets,
    seats,
    saveHistory,
    setSelectedActionTargets,
    isActorDisabledByPoisonOrDrunk,
    isActionAbility,
    addLogWithDeduplication,
    setShowPoisonConfirmModal,
    setShowPoisonEvilConfirmModal,
    isEvil
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
    
    // Setup and validation handlers
    handleBaronAutoRebalance,
    handlePreStartNight,
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
    
    // Group C: Phase/Control functions
    declareMayorImmediateWin,
    handleDayEndTransition,
    handleRestart,
    handleSwitchScript,
    handleNewGame,
    handleStepBack,
    handleGlobalUndo,
    
    // Group D: Seat Interaction functions
    onSeatClick,
    toggleStatus,
    setHadesiaChoice,
    
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

