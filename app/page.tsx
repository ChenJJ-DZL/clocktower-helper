"use client";

import { useMemo, useEffect, useCallback, useRef } from "react";
import { roles, Role, Seat, StatusEffect, LogEntry, GamePhase, WinResult, groupedRoles, typeLabels, typeColors, typeBgColors, RoleType, scripts, Script } from "./data";
import { NightHintState, NightInfoResult, GameRecord, phaseNames } from "../src/types/game";
import { useGameController } from "../src/hooks/useGameController";
import { useRoleAction } from "../src/hooks/useRoleAction";
import { isRoleRegistered } from "../src/roles/index";
import PortraitLock from "../src/components/PortraitLock";
import GameStage from "../src/components/GameStage";
import { ModalWrapper } from "../src/components/modals/ModalWrapper";
import { GameHeader } from "../src/components/game/info/GameHeader";
import { LogViewer } from "../src/components/game/info/LogViewer";
import {
  getSeatPosition,
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
  type RegistrationCacheOptions,
  type RegistrationResult
} from "../src/utils/gameRules";

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

// formatTimer is now imported from useGameController


// 获取玩家的注册阵营用于查验类技能
// 间谍虽然是爪牙但可以被注册为"Good"善良
// 隐士虽然是外来者但可以被注册Evil"邪恶
// viewingRole: 执行查验的角色用于判断是否需要应用注册判

// 判断玩家是否被注册为恶魔用于占卜师等角色
// 隐士可能被注册为恶魔间谍不相关占卜师检查的是恶魔不是邪恶
const isRegisteredAsDemon = (
  targetPlayer: Seat,
  options?: RegistrationCacheOptions
): boolean => {
  const registration = getRegistration(
    targetPlayer,
    undefined,
    undefined,
    undefined,
    options
  );
  return registration.registersAsDemon;
};

// 判断玩家是否被注册为爪牙用于调查员等角色
// 间谍虽然是爪牙但可能被注册Good"善良此时不应被调查员看
// viewingRole: 执行查验的角色用于判断是否需要应用注册判
const isRegisteredAsMinion = (
  targetPlayer: Seat,
  viewingRole?: Role | null,
  spyDisguiseMode?: 'off' | 'default' | 'on',
  spyDisguiseProbability?: number,
  options?: RegistrationCacheOptions
): boolean => {
  if (!targetPlayer.role) return false;
  
  // 真实爪牙
  if (targetPlayer.role.type === 'minion') {
    // 如果是间谍需要检查注册判
    if (targetPlayer.role.id === 'spy') {
      // 如果查看者不是查验类角色或者间谍伪装模式关闭返回真实类型是爪牙
      if (!viewingRole || spyDisguiseMode === 'off') {
        return true;
      }
      // 如果间谍被注册为善良则不应被注册为爪牙
      const registeredAlignment = getRegisteredAlignment(
        targetPlayer,
        viewingRole,
        spyDisguiseMode,
        spyDisguiseProbability,
        options
      );
      // 如果被注册为善良则不被注册为爪牙如果被注册为邪恶则被注册为爪牙
      return registeredAlignment === 'Evil';
    }
    // 其他爪牙总是被注册为爪牙
    return true;
  }
  
  // 隐士可能被注册为爪牙如果被注册为邪恶可能在某些查验中被视为爪牙
  // 但根据规则调查员检查的爪牙"隐士通常不会被注册为爪牙类型
  // 这里保持原逻辑隐士不会被注册为爪牙类
  
  return false;
};


// getSeatRoleId is now imported from useGameController

// cleanseSeatStatuses is now imported from useGameController


// isActionAbility, isActorDisabledByPoisonOrDrunk, addDrunkMark, isEvilForWinCondition,
// getDisplayRoleType, hasTeaLadyProtection, hasExecutionProof are now imported from useGameController


// --- 核心计算逻辑 ---
// calculateNightInfo 已迁移到 src/utils/nightLogic.ts
import { calculateNightInfo } from "@/src/utils/nightLogic";
import { useNightLogic } from "../src/hooks/useNightLogic";
import { SeatNode } from "@/src/components/SeatNode";
import { ControlPanel } from "@/src/components/ControlPanel";
import { GameRecordsModal } from "@/src/components/modals/GameRecordsModal";
import { ReviewModal } from "@/src/components/modals/ReviewModal";
import { RoleInfoModal } from "@/src/components/modals/RoleInfoModal";
import { ExecutionResultModal } from "@/src/components/modals/ExecutionResultModal";
import { ShootResultModal } from "@/src/components/modals/ShootResultModal";
import { KillConfirmModal } from "@/src/components/modals/KillConfirmModal";
import { RestartConfirmModal } from "@/src/components/modals/RestartConfirmModal";
import { NightDeathReportModal } from "@/src/components/modals/NightDeathReportModal";
import { AttackBlockedModal } from "@/src/components/modals/AttackBlockedModal";
import { MayorThreeAliveModal } from "@/src/components/modals/MayorThreeAliveModal";
import { PoisonConfirmModal } from "@/src/components/modals/PoisonConfirmModal";
import { PoisonEvilConfirmModal } from "@/src/components/modals/PoisonEvilConfirmModal";
import { SaintExecutionConfirmModal } from "@/src/components/modals/SaintExecutionConfirmModal";
import { LunaticRpsModal } from "@/src/components/modals/LunaticRpsModal";
import { VirginTriggerModal } from "@/src/components/modals/VirginTriggerModal";
import { RavenkeeperFakeModal } from "@/src/components/modals/RavenkeeperFakeModal";
import { MayorRedirectModal } from "@/src/components/modals/MayorRedirectModal";
import { StorytellerDeathModal } from "@/src/components/modals/StorytellerDeathModal";
import { SweetheartDrunkModal } from "@/src/components/modals/SweetheartDrunkModal";
import { KlutzChoiceModal } from "@/src/components/modals/KlutzChoiceModal";
import { MoonchildKillModal } from "@/src/components/modals/MoonchildKillModal";
import { HadesiaKillConfirmModal } from "@/src/components/modals/HadesiaKillConfirmModal";
import { PitHagModal } from "@/src/components/modals/PitHagModal";
import { RangerModal } from "@/src/components/modals/RangerModal";
import { DamselGuessModal } from "@/src/components/modals/DamselGuessModal";
import { GameModals } from "@/src/components/game/GameModals";
import { GameBoard } from "@/src/components/game/GameBoard";

// ======================================================================
//  暗流涌动 / 暗流涌动剧本 / 游戏的第一部分
//  - 当前组件中除加载动画showIntroLoading / triggerIntroLoading 及对JSX)
//    之外的所有状态逻辑与界面均属于暗流涌动剧本游戏的第一部分的实现
//  - 未来若新增其他剧本可通过拆分/复用这里的结构作为参考
// ======================================================================
export default function Home() {
  // ===========================
  //      使用 useGameController Hook 获取所有状态和逻辑
  // ===========================
  const controller = useGameController();
  // 解构所有状态变量和函数
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
    
    // Helper functions from useGameController
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
    handleBaronAutoRebalance,
    handlePreStartNight,
    confirmDrunkCharade,
    proceedToCheckPhase,
    getStandardComposition,
    cleanseSeatStatuses,
    formatTimer,
    getSeatRoleId,
    isActionAbility,
    isActorDisabledByPoisonOrDrunk,
    addDrunkMark,
    isEvilForWinCondition,
    getDisplayRoleType,
    hasTeaLadyProtection,
    hasExecutionProof,
    validateBaronSetup,
    validateCompositionSetup,
    reviveSeat,
    convertPlayerToEvil,
    insertIntoWakeQueueAfterCurrent,
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
  } = controller;
  
  // 注意seatsRef 需要同步 seats 状态
  seatsRef.current = seats;

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
  // Note: 初始化逻辑已迁移到 useGameController，这里不再需要

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

  // 间谍/隐士查验结果在同一夜晚保持一致伪装参数变化时刷新缓
  useEffect(() => {
    if (gamePhase === 'firstNight' || gamePhase === 'night') {
      resetRegistrationCache(`${gamePhase}-${nightCount}-disguise`);
    }
  }, [spyDisguiseMode, spyDisguiseProbability, resetRegistrationCache]);

  // 进入新的夜晚阶段时重置同夜查验结果缓存保证当晚内一致跨夜独
  useEffect(() => {
    if (gamePhase === 'firstNight' || gamePhase === 'night') {
      resetRegistrationCache(`${gamePhase}-${nightCount}`);
    }
  }, [gamePhase, nightCount, resetRegistrationCache]);

  // 检测设备方向和屏幕尺寸
  useEffect(() => {
    if (!mounted) return;
    
    const checkOrientation = () => {
      // 检测是否为竖屏高度大于宽度或者使用媒体查
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

  // 预留的一次配对状态后续在梦陨春宵角色逻辑中使
  useEffect(() => {
    // 目前仅用于保持状态引用防止未使用警
  }, [fangGuConverted, jugglerGuesses, evilTwinPair, usedOnceAbilities, witchActive, cerenovusTarget, witchCursedId, todayExecutedId]);

  // 清理已离场的气球驾驶员记
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

  useEffect(() => {
    if (nightInfo) {
      // 生成缓存 key用上一时恢hint不重新生成
      const hintKey = `${gamePhase}-${currentWakeIndex}-${nightInfo?.seat?.id}`;
      
      // 检查缓存中是否有该角色hint用上一时恢复
      const cachedHint = hintCacheRef.current.get(hintKey);
      if (cachedHint) {
        setCurrentHint(cachedHint);
        if (cachedHint.fakeInspectionResult) {
          fakeInspectionResultRef.current = cachedHint.fakeInspectionResult;
        }
        return; // 使用缓存hint不重新计算
      }
      
      // 没有缓存重新计hint
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
        // guide 中提取信息格式" 你得X号角色类型镇
        const match = nightInfo.guide.match(/你得(\d+)号，角色类型：(.+)/);
        if (match) {
          const seatNum = match[1];
          const typeName = match[2].trim();
          addLogWithDeduplication(
            `${nightInfo?.seat?.id ? nightInfo.seat.id + 1 : 0}号(气球驾驶员) 得知 ${seatNum}号，角色类型：${typeName}`,
            nightInfo?.seat?.id ?? 0,
            '气球驾驶员'
          );
          // 记录已知类型防止重
          setBalloonistKnownTypes(prev => {
            const seatId = nightInfo?.seat?.id ?? 0;
            const known = prev[seatId] || [];
            if (known.includes(typeName)) return prev;
            return { ...prev, [seatId]: [...known, typeName] };
          });
        }
      }
      
      // 保存到缓
      hintCacheRef.current.set(hintKey, newHint);
      setCurrentHint(newHint);
      
      if (selectedActionTargets.length > 0 && seats.find(s=>s.id===selectedActionTargets[0])?.id !== wakeQueueIds[currentWakeIndex]) {
        setSelectedActionTargets([]); 
        setInspectionResult(null);
        fakeInspectionResultRef.current = null;
      }
    }
  }, [currentWakeIndex, gamePhase, nightInfo, seats, selectedActionTargets, currentHint.fakeInspectionResult, gameLogs, addLogWithDeduplication]);

  // 夜晚阶段切换角色时自动滚动控制台到顶部
  useEffect(() => {
    if ((gamePhase === 'firstNight' || gamePhase === 'night') && consoleContentRef.current) {
      consoleContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentWakeIndex, gamePhase]);

  // 动态调当前是X号X角色在行的字体大小确保不超出容
  const adjustActionTextSize = useCallback(() => {
    if (currentActionTextRef.current && nightInfo) {
      const textElement = currentActionTextRef.current;
      const container = textElement.parentElement;
      if (!container) return;

      // 重置字体大小
      textElement.style.fontSize = '';
      
      // 获取容器宽度和文本宽
      const containerWidth = container.offsetWidth;
      const textWidth = textElement.scrollWidth;
      
      // 如果文本超出容器则缩小字体
      if (textWidth > containerWidth) {
        const baseFontSize = 30; // text-3xl 对应的大0px
        const scale = containerWidth / textWidth;
        const newFontSize = Math.max(baseFontSize * scale * 0.95, 12); // 最2px留5%边距
        textElement.style.fontSize = `${newFontSize}px`;
      }
    }
  }, [nightInfo]);

  useEffect(() => {
    adjustActionTextSize();
    // 窗口大小改变时重新计
    window.addEventListener('resize', adjustActionTextSize);
    return () => {
      window.removeEventListener('resize', adjustActionTextSize);
    };
  }, [adjustActionTextSize, currentWakeIndex]);

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

  // Note: 游戏结束时保存对局记录的逻辑已迁移到 useGameController

  // 检查游戏结束条逻辑已迁移到 useGameController 中的 checkGameOver
  
  // ======================================================================
  //  游戏流程 / 剧本流程 / 通用流程
  //  - 以下 : gamePhase 相关的状态函数和处理逻辑
  //    定义了当前剧本暗流涌动的整套通用流程
  //    准备阶(setup) 核对身份 (check) 首夜 (firstNight)
  //      白天 (day) 黄昏/处决 (dusk) 夜晚 (night)
  //      天亮结算 (dawnReport) 游戏结束 (gameOver)
  //  - 未来如果开发新的剧本可以整体复制 / 修改这一段流程代码
  //    作为新剧本的游戏流/ 剧本流程 / 通用流程模板
  // ======================================================================
  // --- Handlers ---
  // 恶魔无技能夜晚如首夜仅展示信息跳过回合时禁止选择任何目标
  const demonActionDisabled = useMemo(() => {
    if (!nightInfo) return false;
    if (nightInfo.effectiveRole.type !== 'demon') return false;
    const act = nightInfo.action || '';
    // 首夜且行为不是直接杀人时视为无技
    if (gamePhase === 'firstNight' && !act.includes('杀死')) return true;
    // 明确的跳无信仅展示
    if (['跳过', '无信息', '展示'].some(k => act.includes(k))) return true;
    return false;
  }, [nightInfo, gamePhase]);

  const isTargetDisabled = (s: Seat) => {
    if (!nightInfo) return true;
    if (demonActionDisabled) return true;
    const rid = nightInfo.effectiveRole.id;
    if (rid === 'monk' && s.id === nightInfo?.seat?.id) return true;
    if (rid === 'poisoner' && s.isDead) return true;
    if (rid === 'ravenkeeper' && nightInfo?.seat?.id !== undefined && !deadThisNight.includes(nightInfo?.seat?.id ?? 0)) return true;
    // 镜像双子只能选择善良玩家
    if (rid === 'evil_twin' && gamePhase === 'firstNight') {
      if (!s.role) return true;
      if (s.role.type !== 'townsfolk' && s.role.type !== 'outsider') return true;
    }
    // 7. 修复小恶魔选择问题 - 首夜不能选人非首夜可以选择
    if (rid === 'imp' && gamePhase === 'firstNight') return true;
    // 小恶魔可以选择自己用于身份转移
    // 管家不能选择自己作为主人
    if (rid === 'butler' && s.id === nightInfo?.seat?.id) return true;
    // 教授只能选择死亡玩家且用过能力后禁
    if (rid === 'professor_mr') {
      if (hasUsedAbility('professor_mr', nightInfo?.seat?.id ?? 0)) return true;
      const targetRole = s.role?.id === 'drunk' ? s.charadeRole : s.role;
      if (!s.isDead) return true;
      return !targetRole || targetRole?.type !== 'townsfolk';
    }
    return false;
  };

  const handleSeatClick = (id: number) => {
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
  };

  // getStandardComposition is now imported from useGameController

  // validateBaronSetup and validateCompositionSetup are now imported from useGameController

  // proceedToCheckPhase is now imported from useGameController

  const closeNightOrderPreview = useCallback(() => {
    setPendingNightQueue(null);
    setNightOrderPreview([]);
    setShowNightOrderModal(false);
    setNightQueuePreviewTitle("");
  }, []);


  const toggleTarget = (id: number) => {
    if(!nightInfo) return;
    
    // 保存历史记录
    saveHistory();
    
    // 确定最大选择数量
    let max = 1;
    if (nightInfo.effectiveRole.id === 'fortune_teller') max = 2;
    if (nightInfo.effectiveRole.id === 'hadesia' && gamePhase !== 'firstNight') max = 3;
    if (nightInfo.effectiveRole.id === 'seamstress') max = 2;
    let newT = [...selectedActionTargets];
    
    if (newT.includes(id)) {
      newT = newT.filter(t => t !== id);
    } else {
      if (max === 1) {
        newT = [id]; 
      } else {
        if (newT.length >= max) {
          newT.shift();
        }
        newT.push(id);
      }
    }
    
    setSelectedActionTargets(newT);
    
    // 如果当前叫醒的角色本身已中毒/醉酒且其能力属于行动类能力
    // 则当晚的实际效果应为无事发生可以选择目标但不会产生任何规则效果
    const actorSeat = seats.find(s => s.id === nightInfo?.seat?.id);
    const actorDisabled = isActorDisabledByPoisonOrDrunk(actorSeat, nightInfo.isPoisoned);
    const isActionalAbility = isActionAbility(nightInfo.effectiveRole);
    if (actorDisabled && isActionalAbility) {
      if (newT.length > 0) {
        const tid = newT[newT.length - 1];
        addLogWithDeduplication(
          `${nightInfo?.seat?.id ? nightInfo.seat.id + 1 : 0}号(${nightInfo?.effectiveRole?.name ?? ''}) 处于中毒/醉酒状态，本夜${tid+1}号的行动无效，无事发生`,
          nightInfo?.seat?.id ?? 0,
          nightInfo?.effectiveRole?.name ?? ''
        );
      }
      return;
    }
    
    // 投毒者选择目标后立即显示确认弹
    if(nightInfo.effectiveRole.id === 'poisoner' && nightInfo.effectiveRole.nightActionType === 'poison' && newT.length > 0) {
      const targetId = newT[newT.length - 1];
      const target = seats.find(s => s.id === targetId);
      const isEvilPlayer = target && (['minion','demon'].includes(target.role?.type||'') || target.isDemonSuccessor);
      if(isEvilPlayer) {
        setShowPoisonEvilConfirmModal(targetId);
      } else {
        setShowPoisonConfirmModal(targetId);
      }
      // 只更新高亮不执行下毒等待确认保持其他中毒来
      setSeats(p => p.map(s => {
        return {...s, isPoisoned: computeIsPoisoned(s)};
      }));
      return;
    }
    
    // 小恶魔选择目标后立即显示确认弹
    if(nightInfo.effectiveRole.id === 'imp' && nightInfo.effectiveRole.nightActionType === 'kill' && gamePhase !== 'firstNight' && newT.length > 0) {
      const targetId = newT[newT.length - 1];
      setShowKillConfirmModal(targetId);
      return;
    }
    
    // 1. 统一高亮显示 - 所有选中操作都有视觉反馈
    if(newT.length > 0) {
      const tid = newT[newT.length - 1];
      const action = nightInfo.effectiveRole.nightActionType;
      if(action === 'poison') {
        // 普卡特殊处理只设置中毒不立即死亡并更新上一个中毒目
        if (nightInfo.effectiveRole.id === 'pukka') {
          // 将目标放入普卡队列当前夜晚中毒下一夜死
          setPukkaPoisonQueue(prev => {
            const filtered = prev.filter(entry => entry.targetId !== tid);
            return [...filtered, { targetId: tid, nightsUntilDeath: 1 }];
          });
          // 注意保留永久中毒标记舞蛇人制造和亡骨魔中毒标记同时保留既有的普卡中毒标记
          setSeats(p => p.map(s => {
            if (s.id === tid) {
              // 普卡当前夜晚中毒下一夜死亡并恢复健康所以清除时间是"下一夜死亡时"
              const clearTime = '下一夜死亡时';
              const { statusDetails, statuses } = addPoisonMark(s, 'pukka', clearTime);
              const nextSeat = { ...s, statusDetails, statuses };
              return { ...nextSeat, isPoisoned: computeIsPoisoned(nextSeat) };
            }
            return { ...s, isPoisoned: computeIsPoisoned(s) };
          }));
          if (nightInfo) {
            // 7. 行动日志去重移除该玩家之前的操作记录只保留最新的
            setGameLogs(prev => {
              const filtered = prev.filter(log => 
                !(log.message.includes(`${nightInfo?.seat?.id ? nightInfo.seat.id + 1 : 0}普卡)`) && log.phase === gamePhase
              ));
              return [
                ...filtered, 
                { 
                  day: nightCount, 
                  phase: gamePhase, 
                  message: `${nightInfo?.seat?.id ? nightInfo.seat.id + 1 : 0}号(普卡) 今晚${tid+1}号中毒，他会在下一个夜晚开始前死亡并恢复健康`
                }
              ];
            });
          }
        } else {
          // 其他投毒者投毒者夜半狂欢投毒者的正常处
          // 注意保留永久中毒标记舞蛇人制造和亡骨魔中毒标记
          setSeats(p => p.map(s => {
            if (s.id === tid) {
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
          if (nightInfo) {
            // 7. 行动日志去重移除该玩家之前的操作记录只保留最新的
            setGameLogs(prev => {
              const filtered = prev.filter(log => 
                !(log.message.includes(`${nightInfo?.seat?.id ? nightInfo.seat.id + 1 : 0}投毒`) && log.phase === gamePhase)
              );
              return [...filtered, { day: nightCount, phase: gamePhase, message: `${nightInfo?.seat?.id ? nightInfo.seat.id + 1 : 0}投毒 ${tid+1}下毒` }];
            });
          }
        }
      }
      if(action === 'protect') {
        if (nightInfo) {
          // 使用nightInfo.isPoisoned和seats状态双重检查确保判断准确
          const monkSeat = seats.find(s => s.id === nightInfo?.seat?.id);
          const isMonkPoisoned = nightInfo.isPoisoned || 
                                 (monkSeat ? (monkSeat.isPoisoned || monkSeat.isDrunk || monkSeat.role?.id === "drunk") : false);
          
          // 如果僧侣中毒/醉酒绝对不能设置保护效果但可以正常选择玩家
          if (isMonkPoisoned) {
            // 强制清除所有保护状态确保不会有任何保护效
            setSeats(p => p.map(s => {
              // 如果这个玩家是被当前僧侣保护的清除保护
              if (s.protectedBy === nightInfo?.seat?.id) {
                return {...s, isProtected: false, protectedBy: null};
              }
              return s;
            }));
            // 记录日志选择但无保护效果
            setGameLogs(prev => {
              const filtered = prev.filter(log => 
                !(log.message.includes(`${nightInfo?.seat?.id ? nightInfo.seat.id + 1 : 0}号(僧侣)`) && log.phase === gamePhase)
              );
              const seatId = nightInfo?.seat?.id ?? 0;
              return [...filtered, { day: nightCount, phase: gamePhase, message: `${seatId+1}号(僧侣) 选择保护 ${tid+1}号，但中醉酒状态下无保护效果` }];
            });
          } else {
            // 健康状态下正常保护先清除所有保护然后只设置目标玩家的保护
            setSeats(p => {
              const updated = p.map(s => ({...s, isProtected: false, protectedBy: null}));
              const seatId = nightInfo?.seat?.id ?? 0;
              return updated.map(s => s.id === tid ? {...s, isProtected: true, protectedBy: seatId} : s);
            });
            setGameLogs(prev => {
              const filtered = prev.filter(log => 
                !(log.message.includes(`${nightInfo?.seat?.id ? nightInfo.seat.id + 1 : 0}号(僧侣)`) && log.phase === gamePhase)
              );
              const seatId = nightInfo?.seat?.id ?? 0;
              return [...filtered, { day: nightCount, phase: gamePhase, message: `${seatId+1}号(僧侣) 保护 ${tid+1}号` }];
            });
          }
        }
      }
      // 莽夫每夜首个以自身能力选择莽夫的玩家会醉酒至下个黄昏莽夫阵营暂随选择者以状态提示
      if (!goonDrunkedThisNight) {
        const targetSeat = seats.find(s => s.id === tid);
        const chooserSeat = seats.find(s => s.id === nightInfo?.seat?.id);
        const isActional = ['kill', 'poison', 'protect', 'mark', 'kill_or_skip'].includes(nightInfo.effectiveRole.nightActionType || '');
        const validChooser = chooserSeat && !chooserSeat.isDead;
        if (targetSeat?.role?.id === 'goon' && !targetSeat.isDead && isActional && validChooser) {
          setGoonDrunkedThisNight(true);
          const chooserId = nightInfo?.seat?.id ?? 0;
          setSeats(p => p.map(s => {
            if (s.id === chooserId) {
              // 莽夫首个选择者醉酒至下个黄昏
              const clearTime = '下个黄昏';
              const { statusDetails, statuses } = addDrunkMark(s, 'goon', clearTime);
              return { ...s, isDrunk: true, statusDetails, statuses };
            }
            if (s.id === targetSeat.id) {
              const detail = '莽夫阵营暂随选择';
              const statusDetails = Array.from(new Set([...(s.statusDetails || []), detail]));
              return { ...s, statusDetails };
            }
            return s;
          }));
          addLog(`${chooserId+1}号以能力选择${targetSeat.id+1}号(莽夫)，${chooserId+1}号醉酒至下个黄昏，莽夫阵营暂随选择者`);
        }
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'devils_advocate' && newT.length === 1) {
        const targetId = newT[0];
        setSeats(p => p.map(s => {
          const filtered = (s.statuses || []).filter(status => status.effect !== 'ExecutionProof');
          if (s.id === targetId) {
            const seatId = nightInfo?.seat?.id ?? 0;
            const nextStatuses: StatusEffect[] = [...filtered, { effect: 'ExecutionProof', duration: '1 Day', sourceId: seatId }];
            return { ...s, statuses: nextStatuses };
          }
          return { ...s, statuses: filtered };
        }));
        setGameLogs(prev => {
          const filtered = prev.filter(log => 
            !(log.message.includes(`${nightInfo?.seat?.id ? nightInfo.seat.id + 1 : 0}魔鬼代言`) && log.phase === gamePhase)
          );
          const seatId = nightInfo?.seat?.id ?? 0;
          return [...filtered, { day: nightCount, phase: gamePhase, message: `${seatId+1}魔鬼代言 选择保护 ${targetId+1}免于今日处决` }];
        });
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'butler') {
        setSeats(p => p.map(s => ({...s, masterId: tid})));
        if (nightInfo) {
          // 7. 行动日志去重
          setGameLogs(prev => {
            const filtered = prev.filter(log => 
              !(log.message.includes(`${nightInfo?.seat?.id ? nightInfo.seat.id + 1 : 0}号(管家)`) && log.phase === gamePhase)
            );
            const seatId = nightInfo?.seat?.id ?? 0;
            return [...filtered, { day: nightCount, phase: gamePhase, message: `${seatId+1}号(管家) 选择 ${tid+1}为主人` }];
          });
        }
      }
      // 小恶魔需要确认不立即执行死
      if(action === 'kill' && nightInfo.effectiveRole.id === 'imp' && gamePhase !== 'firstNight') {
        // 只更新选择不执行杀死等待确认
      }
      // ========== 夜半狂欢角色处理 ==========
      if(action === 'mark' && nightInfo.effectiveRole.id === 'snake_charmer_mr' && newT.length === 1) {
        // 舞蛇人选择一名玩家如果选中了恶魔交换角色和阵
        const targetSeat = seats.find(s => s.id === newT[0]);
        if (targetSeat && targetSeat.role && (targetSeat.role.type === 'demon' || targetSeat.isDemonSuccessor)) {
          // 选中了恶魔交换角色和阵
          const snakeCharmerSeat = nightInfo.seat;
          const demonRole = targetSeat.role;
          const snakeCharmerRole = snakeCharmerSeat.role;
          
          setSeats(p => p.map(s => {
            if (s.id === snakeCharmerSeat.id) {
              return { ...s, role: demonRole, isDemonSuccessor: targetSeat.isDemonSuccessor, isEvilConverted: true, isGoodConverted: false };
            } else if (s.id === targetSeat.id) {
              // 旧恶魔新舞蛇人永久中毒使statusDetails 标记
              const { statusDetails, statuses } = addPoisonMark(s, 'snake_charmer', '永久');
              return { 
                ...s, 
                role: snakeCharmerRole, 
                isPoisoned: true, 
                isDemonSuccessor: false,
                isGoodConverted: true,
                isEvilConverted: false,
                statusDetails,
                statuses
              };
            }
            return s;
          }));
          
          setGameLogs(prev => [...prev, { 
            day: nightCount, 
            phase: gamePhase, 
            message: `${snakeCharmerSeat.id+1}号(舞蛇人) 选择 ${targetSeat.id+1}号，交换角色和阵营，${targetSeat.id+1}号中毒，舞蛇人转邪恶，恶魔转善良` 
          }]);
        } else {
          // 没有选中恶魔只记录选择
          setGameLogs(prev => {
            const filtered = prev.filter(log => 
              !(log.message.includes(`${nightInfo?.seat?.id ? nightInfo.seat.id + 1 : 0}舞蛇`) && log.phase === gamePhase)
            );
            const seatId = nightInfo?.seat?.id ?? 0;
            return [...filtered, { day: nightCount, phase: gamePhase, message: `${seatId+1}号(舞蛇人) 选择 ${newT[0]+1}号` }];
          });
        }
      }
      // ========== 梦陨春宵角色处理 ==========
      if(action === 'mark' && nightInfo.effectiveRole.id === 'philosopher' && newT.length === 1) {
        // 哲学家每局游戏限一次选择一个善良角色获得该角色的能力原角色醉酒
        const seatId = nightInfo?.seat?.id ?? 0;
        if (hasUsedAbility('philosopher', seatId)) {
          addLog(`${seatId+1}号(哲学家) 已用完一次性能力`);
          return;
        }
        setShowRoleSelectModal({
          type: 'philosopher',
          targetId: newT[0],
          onConfirm: (roleId: string) => {
            const targetRole = roles.find(r => r.id === roleId && (r.type === 'townsfolk' || r.type === 'outsider'));
            if (!targetRole) {
              alert('角色无效或非善良角色');
              return;
            }
            const targetSeatId = newT[0];
            setSeats(prev => prev.map(s => {
              if (s.id === seatId) {
                return { ...s, role: targetRole };
              }
              if (s.role?.id === targetRole.id) {
                // 哲学家原角色从当晚开始醉酒三天三
                const clearTime = '三天三夜';
                const { statusDetails, statuses } = addDrunkMark(s, 'philosopher', clearTime);
                return { ...s, isDrunk: true, statusDetails, statuses };
              }
              return s;
            }));
            addLog(`${seatId+1}号(哲学家) 获得 ${targetRole?.name ?? ''} 的能力`);
            markAbilityUsed('philosopher', seatId);
            setShowRoleSelectModal(null);
            continueToNextAction();
          }
        });
        return;
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'witch' && newT.length === 1) {
        // 女巫每晚选择一名玩家如果他明天白天发起提名他死
        const targetId = newT[0];
        const aliveCount = seats.filter(s => !s.isDead).length;
        if (aliveCount <= 3) {
          const seatId = nightInfo?.seat?.id ?? 0;
          addLog(`${seatId+1}号(女巫) 只有三名或更少存活的玩家，失去此能力`);
          return;
        }
        setWitchCursedId(targetId);
        setWitchActive(true);
        const seatId = nightInfo?.seat?.id ?? 0;
        addLogWithDeduplication(
          `${seatId+1}号(女巫) 诅咒 ${targetId+1}号，若其明天发起提名则死亡`,
          seatId,
          '女巫'
        );
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'evil_twin' && newT.length === 1) {
        // 镜像双子首夜选择一名善良玩家作为对
        const targetId = newT[0];
        const targetSeat = seats.find(s => s.id === targetId);
        if (!targetSeat) return;
        // 验证目标必须是善良玩
        const isGood = targetSeat.role && (targetSeat.role.type === 'townsfolk' || targetSeat.role.type === 'outsider');
        if (!isGood) {
          alert('镜像双子必须选择一名善良玩家作为对手');
          return;
        }
        const evilId = nightInfo?.seat?.id ?? 0;
        setEvilTwinPair({ evilId, goodId: targetId });
        addLog(`${evilId+1}号(镜像双子) 选择 ${targetId+1}号作为对手`);
        continueToNextAction();
        return;
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'cerenovus' && newT.length === 1) {
        // 洗脑师每晚选择一名玩家和一个善良角
        const targetId = newT[0];
        setShowRoleSelectModal({
          type: 'cerenovus',
          targetId,
          onConfirm: (roleId: string) => {
            const targetRole = roles.find(r => r.id === roleId && (r.type === 'townsfolk' || r.type === 'outsider'));
            if (!targetRole) {
              alert('角色无效或非善良角色');
              return;
            }
            setCerenovusTarget({ targetId, roleName: targetRole.name });
            const seatId = nightInfo?.seat?.id ?? 0;
            addLogWithDeduplication(`${seatId+1}号(洗脑师) 要求 ${targetId+1}号疯狂扮演 ${targetRole?.name ?? ''}`, seatId, '洗脑师');
            setShowRoleSelectModal(null);
          }
        });
        return;
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'pit_hag' && newT.length === 1) {
        // 麻脸巫婆每晚选择一名玩家和一个角色如果该角色不在场他变成该角
        const targetId = newT[0];
        setShowRoleSelectModal({
          type: 'pit_hag',
          targetId,
          onConfirm: (roleId: string) => {
            const targetRole = roles.find(r => r.id === roleId);
            if (!targetRole) {
              alert('角色不存在');
              return;
            }
            const exists = seats.some(s => (getSeatRoleId(s) === targetRole.id) || (s.isDemonSuccessor && targetRole.type === 'demon'));
            if (exists) {
              const seatId = nightInfo?.seat?.id ?? 0;
              addLog(`${seatId+1}号(麻脸巫婆) 选择 ${targetId+1}号变为 ${targetRole?.name ?? ''} 失败，场上已有该角色`);
              setShowRoleSelectModal(null);
              continueToNextAction();
              return;
            }
            setSeats(prev => prev.map(s => {
              if (s.id === targetId) {
                const cleaned = cleanseSeatStatuses({ ...s, isDemonSuccessor: false }, { keepDeathState: true });
                const nextSeat = { ...cleaned, role: targetRole, charadeRole: null };
                if (s.hasAbilityEvenDead) {
                  addLog(`${s.id+1}号因亡骨魔获得的"死而有能"效果在变身${targetRole.name} 时已失效`);
                }
                return nextSeat;
              }
              return s;
            }));
            const seatId = nightInfo?.seat?.id ?? 0;
            addLog(`${seatId+1}号(麻脸巫婆) ${targetId+1}号变为 ${targetRole?.name ?? ''}`);
            setShowRoleSelectModal(null);
            if (targetRole.type === 'demon') {
              setShowStorytellerDeathModal({ sourceId: targetId });
            }
            // 新角色当夜按顺位加入唤醒队列可在本夜发动能
            insertIntoWakeQueueAfterCurrent(targetId, { roleOverride: targetRole, logLabel: `${targetId+1}号(${targetRole.name})` });
            continueToNextAction();
          }
        });
        return;
      }
      // 气球驾驶员已改为被动信息技能不再需要主动选择处理
      if(action === 'kill' && nightInfo.effectiveRole.id === 'vigormortis_mr' && gamePhase !== 'firstNight' && newT.length === 1) {
        // 夜半狂欢恶魔选择1名玩家后立即显示确认弹窗
        setShowKillConfirmModal(newT[0]);
        return;
      }
      if(action === 'kill' && nightInfo.effectiveRole.id === 'hadesia' && gamePhase !== 'firstNight' && newT.length === 3) {
        // 哈迪寂亚选择3名玩家后弹窗确认允许说书人决定谁会死亡
        const initChoices: Record<number, 'live' | 'die'> = {};
        newT.forEach(id => { initChoices[id] = 'live'; });
        setHadesiaChoices(initChoices);
        setShowHadesiaKillConfirmModal(newT);
        return;
      }
      if(action === 'poison' && nightInfo.effectiveRole.id === 'poisoner_mr' && newT.length > 0) {
        // 夜半狂欢投毒者选择目标后立即显示确认弹
        const targetId = newT[newT.length - 1];
        const target = seats.find(s => s.id === targetId);
        const isEvilPlayer = target && (['minion','demon'].includes(target.role?.type||'') || target.isDemonSuccessor);
        if(isEvilPlayer) {
          setShowPoisonEvilConfirmModal(targetId);
        } else {
          setShowPoisonConfirmModal(targetId);
        }
        // 注意保留永久中毒标记舞蛇人制造和亡骨魔中毒标记
        setSeats(p => p.map(s => {
          return {...s, isPoisoned: computeIsPoisoned(s)};
        }));
        return;
      }
      // 梦陨春宵恶魔选择目标后立即显示确认弹
      if(action === 'kill' && ['fang_gu', 'no_dashii', 'vortox'].includes(nightInfo.effectiveRole.id) && gamePhase !== 'firstNight' && newT.length === 1) {
        setShowKillConfirmModal(newT[0]);
        return;
      }
    } else {
      const action = nightInfo.effectiveRole.nightActionType;
      if(action === 'poison') {
        // 注意保留永久中毒标记舞蛇人制造和亡骨魔中毒标记
        setSeats(p => p.map(s => {
          return {...s, isPoisoned: computeIsPoisoned(s)};
        }));
      }
      if(action === 'protect') {
        // 僧侣/旅店老板保护效果在确认时统一落地
        setSeats(p => p.map(s => ({...s, isProtected: false, protectedBy: null})));
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'devils_advocate') {
        setSeats(p => p.map(s => ({
          ...s,
          statuses: (s.statuses || []).filter(status => status.effect !== 'ExecutionProof')
        })));
      }
    }
    
    if(nightInfo.effectiveRole.nightActionType === 'inspect') {
      const rid = nightInfo.effectiveRole.id;
      if (rid === 'dreamer' && newT.length === 1) {
        const target = seats.find(s => s.id === newT[0]);
        if (target) {
          const goodRoles = getFilteredRoles(roles).filter(r => ['townsfolk','outsider'].includes(r.type));
          const evilRoles = getFilteredRoles(roles).filter(r => ['minion','demon'].includes(r.type));
          const good = getRandom(goodRoles);
          const evil = getRandom(evilRoles);
          let shownGood = good;
          let shownEvil = evil;
          const targetAlignment = target.role?.type;
          const targetIsGood = targetAlignment === 'townsfolk' || targetAlignment === 'outsider';
          const targetIsEvil = targetAlignment === 'minion' || targetAlignment === 'demon' || target?.isDemonSuccessor;
          const shouldFake = currentHint.isPoisoned || isVortoxWorld;
          if (shouldFake) {
            // 给出一对与真实阵营不符的组
            if (targetIsGood) {
              // 给两恶或错配
              shownGood = evil;
            } else if (targetIsEvil) {
              shownEvil = good;
            } else {
              shownGood = evil;
              shownEvil = good;
            }
          }
          const resultText = `善良{shownGood.name || '未知'} / 邪恶{shownEvil.name || '未知'}`;
          setInspectionResult(resultText);
          setInspectionResultKey(k => k + 1);
          const seatId = nightInfo?.seat?.id ?? 0;
          addLogWithDeduplication(
            `${seatId+1}号(筑梦者) 查验 ${target.id+1}号 -> ${resultText}${shouldFake ? '（假信息）' : ''}`,
            seatId,
            '筑梦者'
          );
        }
      } else if (rid === 'seamstress') {
        const seatId = nightInfo?.seat?.id ?? 0;
        if (hasUsedAbility('seamstress', seatId)) {
          setInspectionResult("已用完一次性能力");
          setInspectionResultKey(k => k + 1);
          return;
        }
        if (newT.length === 2) {
          const [aId, bId] = newT;
          const a = seats.find(s => s.id === aId);
          const b = seats.find(s => s.id === bId);
          if (!a || !b) return;
          const same = isEvilForWinCondition(a) === isEvilForWinCondition(b);
          const shouldFake = currentHint.isPoisoned || isVortoxWorld;
          const shownSame = shouldFake ? !same : same;
          const text = shownSame ? "同阵营" : "不同阵营";
          setInspectionResult(text);
          setInspectionResultKey(k => k + 1);
          addLogWithDeduplication(
            `${seatId+1}号(女裁缝) 查验 ${aId+1}号、${bId+1}号 -> ${text}${shouldFake ? '（假信息）' : ''}`,
            seatId,
            '女裁缝'
          );
          markAbilityUsed('seamstress', seatId);
        } else {
          setInspectionResult(null);
        }
      } else if (newT.length === 2) {
        // 占卜师等双查验逻辑
        let resultText: string;
        const checkedTargets = newT.map(tid => {
          const t = seats.find(x=>x.id===tid); 
          if (!t || !t.role) return null;
          const registration = getRegistrationCached(t, nightInfo.effectiveRole);
          const isDemon = registration.registersAsDemon;
          const isRedHerring = t.isRedHerring === true || (t.statusDetails || []).includes("红罗刹");
          return { seat: t, isDemon, isRedHerring };
        }).filter((t): t is { seat: Seat; isDemon: boolean; isRedHerring: boolean } => t !== null);
        
        const hasEvil = checkedTargets.some(t => t.isDemon || t.isRedHerring);
        
        if (currentHint.isPoisoned || isVortoxWorld) {
          const targetSeat = seats.find(s => s.id === nightInfo?.seat?.id);
          if (targetSeat) {
            const fakeInfoCheck = drunkFirstInfoRef.current 
              ? shouldShowFakeInfo(targetSeat, drunkFirstInfoRef.current, isVortoxWorld)
              : { showFake: currentHint.isPoisoned || isVortoxWorld, isFirstTime: false };
            if (fakeInfoCheck.showFake) {
              resultText = getMisinformation.fortuneTeller(hasEvil);
              fakeInspectionResultRef.current = resultText;
            } else {
              resultText = hasEvil ? "是" : "否";
            }
          } else {
            resultText = hasEvil ? "是" : "否";
          }
        } else {
          resultText = hasEvil ? "是" : "否";
        }
        setInspectionResult(resultText);
        setInspectionResultKey(k => k + 1);
        
        // 添加详细日志说明查验结果的原因说明为什么是/否
        const targetIds = newT.map(t => t + 1).join('号与');
        const resultTextClean = resultText === "是" ? "是" : "否";
        const reason = hasEvil 
          ? `因为其中有人被注册为恶魔可能是真恶魔也可能是隐士/红罗刹的误导`
          : `因为其中没有人被注册为恶魔`;
        addLogWithDeduplication(
          `占卜师查验${targetIds}号，结果：${resultTextClean}，${reason}`,
          nightInfo.seat.id,
          '占卜师'
        );
      } else {
        setInspectionResult(null);
      }
    }
    
    if(nightInfo.effectiveRole.nightActionType === 'inspect_death' && newT.length === 1) {
      const t = seats.find(s=>s.id===newT[0]);
      if (!currentHint.isPoisoned) {
        // 健康状态在控制台显示真实身份
        if (t?.role) {
          const resultText = `${newT[0]+1}号玩家的真实身份：${t.role.name}`;
          setInspectionResult(resultText);
          setInspectionResultKey(k => k + 1);
          // 记录日志
          const seatId = nightInfo?.seat?.id ?? 0;
          addLogWithDeduplication(
            `${seatId+1}号(守鸦人) 查验 ${newT[0]+1}号 -> ${t.role?.name ?? ''}`,
            seatId,
            '守鸦人'
          );
        }
      } else {
        // 中毒/醉酒状态先弹出选择假身份的弹窗
        setShowRavenkeeperFakeModal(newT[0]);
      }
    }
    if (nightInfo.effectiveRole.id === 'sage' && nightInfo.effectiveRole.nightActionType === 'inspect' && newT.length === 2) {
      const [aId, bId] = newT;
      const shouldFake = currentHint.isPoisoned || isVortoxWorld;
      let infoIds = [aId, bId];
      const killerId = nightInfo.seat.id;
      if (!shouldFake) {
        if (!infoIds.includes(killerId)) {
          infoIds[0] = killerId;
        }
      } else {
        // 假信息随机两名存活玩家
        const aliveIds = seats.filter(s => !s.isDead).map(s => s.id);
        const shuffled = [...aliveIds].sort(() => Math.random() - 0.5);
        infoIds = shuffled.slice(0, 2);
      }
      const seatId = nightInfo?.seat?.id ?? 0;
      addLog(`${seatId+1}号(贤者) 得知 ${infoIds.map(x=>`${x+1}号`).join('、')}，其中一人是杀死自己的恶魔${shouldFake ? '（假信息）' : ''}`);
      setInspectionResult(`你得知${infoIds.map(x=>`${x+1}号`).join('、')}，其中一人为恶魔`);
      setInspectionResultKey(k => k + 1);
      return;
    }
  };

  // handleConfirmAction moved to useGameController - using imported version
  
  // 安全兜底如果夜晚阶段存在叫醒队列但无法生成 nightInfo自动跳过当前环节或直接结束夜晚
  useEffect(() => {
    if (!(gamePhase === 'firstNight' || gamePhase === 'night')) return;
    if (wakeQueueIds.length === 0) return;
    // 只有在当前索引合法但 nightInfo 仍为 null 时才认为是异常卡住
    if (currentWakeIndex < 0 || currentWakeIndex >= wakeQueueIds.length) return;
    if (nightInfo) return;
    
    // 还有后续角色时直接跳到下一个夜晚行
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
  
  // 计算确认按钮的禁用状
  const isConfirmDisabled = useMemo(() => {
    if (!nightInfo) return true;
    if (showKillConfirmModal !== null || showPoisonConfirmModal !== null || showPoisonEvilConfirmModal !== null || showHadesiaKillConfirmModal !== null || 
        showRavenkeeperFakeModal !== null || showMoonchildKillModal !== null || showBarberSwapModal !== null || 
        showStorytellerDeathModal !== null || showSweetheartDrunkModal !== null || showKlutzChoiceModal !== null) {
      return true;
    }
    const roleId = nightInfo.effectiveRole.id;
    const actionType = nightInfo.effectiveRole.nightActionType;
    const phase = gamePhase;

    if (roleId === 'pit_hag_mr') {
      if (selectedActionTargets.length !== 1) return true;
      if (showPitHagModal && !showPitHagModal.roleId) return true;
    }

    const seatId = nightInfo?.seat?.id ?? 0;
    if (roleId === 'professor_mr' && phase !== 'firstNight' && !hasUsedAbility('professor_mr', seatId)) {
      const availableReviveTargets = seats.filter(s => {
        const r = s.role?.id === 'drunk' ? s.charadeRole : s.role;
        return s.isDead && r && r.type === 'townsfolk' && !s.isDemonSuccessor;
      });
      if (availableReviveTargets.length > 0 && selectedActionTargets.length !== 1) return true;
    }

    if (roleId === 'ranger' && phase !== 'firstNight' && !hasUsedAbility('ranger', seatId) && selectedActionTargets.length !== 1) {
      return true;
    }

    if (roleId === 'fortune_teller' && selectedActionTargets.length !== 2) return true;
    if (roleId === 'imp' && phase !== 'firstNight' && actionType !== 'none' && selectedActionTargets.length !== 1) return true;
    if (roleId === 'poisoner' && actionType !== 'none' && selectedActionTargets.length !== 1) return true;
    if (roleId === 'innkeeper' && phase !== 'firstNight' && selectedActionTargets.length !== 2) return true;
    if (roleId === 'shabaloth' && phase !== 'firstNight' && selectedActionTargets.length !== 2) return true;
    if (roleId === 'po' && phase !== 'firstNight') {
      const seatId = nightInfo?.seat?.id ?? 0;
      const charged = poChargeState[seatId] === true;
      const uniqueCount = new Set(selectedActionTargets).size;
      if ((!charged && uniqueCount > 1) || (charged && uniqueCount !== 3)) return true;
    }
    if (roleId === 'ravenkeeper' && actionType === 'inspect_death' && nightInfo.seat.isDead &&
      (selectedActionTargets.length !== 1 || showRavenkeeperFakeModal !== null)) {
      return true;
    }

    return false;
  }, [
    nightInfo,
    gamePhase,
    selectedActionTargets,
    seats,
    poChargeState,
    showKillConfirmModal,
    showPoisonConfirmModal,
    showPoisonEvilConfirmModal,
    showHadesiaKillConfirmModal,
    showRavenkeeperFakeModal,
    showMoonchildKillModal,
    showBarberSwapModal,
    showStorytellerDeathModal,
    showSweetheartDrunkModal,
    showKlutzChoiceModal,
    showPitHagModal,
    hasUsedAbility
  ]);
  
  const confirmNightOrderPreview = useCallback(() => {
    if (!pendingNightQueue) {
      setShowNightOrderModal(false);
      return;
    }
    nightLogic.finalizeNightStart(pendingNightQueue, true);
  }, [pendingNightQueue, nightLogic]);

  // confirmKill moved to useGameController - using imported version

  const confirmMayorRedirect = (redirectTargetId: number | null) => {
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
  };

  const confirmHadesiaKill = () => {
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
  };

  const confirmMoonchildKill = (targetId: number) => {
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
  };
  
  const confirmSweetheartDrunk = (targetId: number) => {
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
  };

  const confirmKlutzChoice = () => {
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
  };
  
  const confirmStorytellerDeath = (targetId: number | null) => {
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
  };
  
  // 确认下毒善良玩家
  // confirmPoison and confirmPoisonEvil moved to useGameController - using imported versions

  // 哈迪寂亚设置单个玩家的命运生/死
  const setHadesiaChoice = (id: number, choice: 'live' | 'die') => {
    setHadesiaChoices(prev => ({ ...prev, [id]: choice }));
  };

  const confirmHadesia = () => {
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
  };

  // executePlayer moved to useGameController - using imported version

  const confirmSaintExecution = () => {
    if (!showSaintExecutionConfirmModal) return;
    const { targetId, skipLunaticRps } = showSaintExecutionConfirmModal;
    setShowSaintExecutionConfirmModal(null);
    executePlayer(targetId, { skipLunaticRps, forceExecution: true });
  };

  const cancelSaintExecution = () => {
    setShowSaintExecutionConfirmModal(null);
  };

  const executeNomination = (sourceId: number, id: number, options?: { virginGuideOverride?: { isFirstTime: boolean; nominatorIsTownsfolk: boolean } }) => {
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
  };

  const handleVirginGuideConfirm = () => {
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
  };

  const handleDayAction = (id: number) => {
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
  };

  type DayAbilityConfig = {
    roleId: string;
    title: string;
    description: string;
    usage: 'daily' | 'once';
    actionType?: 'lunaticKill';
    logMessage: (seat: Seat) => string;
  };

  const handleDayAbilityTrigger = (seat: Seat, config: DayAbilityConfig) => {
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
  };

  // reviveSeat is now imported from useGameController

  // submitVotes moved to useGameController - using imported version

  // executeJudgment moved to useGameController - using imported version
  
  // 6. 确认处决结果后继续游
  // confirmExecutionResult and enterDuskPhase moved to useGameController - using imported versions

  const declareMayorImmediateWin = useCallback(() => {
    setShowMayorThreeAliveModal(false);
    setWinResult('good');
    setWinReason('3人存活且今日不处决市长能力');
    setGamePhase('gameOver');
    addLog('市长在场且剩人今日选择不处决好人胜利');
  }, [addLog]);

  const handleDayEndTransition = useCallback(() => {
    const aliveCount = seats.filter(s => !s.isDead).length;
    const mayorAlive = seats.some(s => s.role?.id === 'mayor' && !s.isDead);
    if (aliveCount === 3 && mayorAlive) {
      setShowMayorThreeAliveModal(true);
      return;
    }
    enterDuskPhase();
  }, [seats, enterDuskPhase]);

  // resolveLunaticRps and confirmShootResult moved to useGameController - using imported versions

  const openContextMenuForSeat = (seatId: number, anchorMode: 'seat' | 'center' = 'seat') => {
    const containerRect = seatContainerRef.current?.getBoundingClientRect();
    const seatRect = seatRefs.current[seatId]?.getBoundingClientRect();
    // 触屏/竖屏需求强制圆桌范围内居中显
    let targetX = 0;
    let targetY = 0;
    if (anchorMode === 'center' && containerRect) {
      targetX = containerRect.left + containerRect.width / 2;
      targetY = containerRect.top + containerRect.height / 2;
    } else {
      targetX = seatRect ? seatRect.left + seatRect.width / 2 : 0;
      targetY = seatRect ? seatRect.top + seatRect.height / 2 : 0;
    }

    if (containerRect) {
      const menuW = 192; // 12rem 192px
      const menuH = 240; // 预估高度稍大以避免遮挡
      const pad = 6;
      const minX = containerRect.left + pad + menuW / 2;
      const maxX = containerRect.right - pad - menuW / 2;
      const minY = containerRect.top + pad + menuH / 2;
      const maxY = containerRect.bottom - pad - menuH / 2;
      targetX = Math.min(Math.max(targetX, minX), maxX);
      targetY = Math.min(Math.max(targetY, minY), maxY);
    }

    setContextMenu({ x: targetX, y: targetY, seatId });
  };

  const handleContextMenu = (e: React.MouseEvent, seatId: number) => { 
    e.preventDefault(); 
    const seat = seats.find(s => s.id === seatId);
    if (gamePhase === 'check' && seat?.role?.id === 'drunk') {
      setShowDrunkModal(seatId);
      return;
    }
    if (isPortrait) {
      openContextMenuForSeat(seatId, 'center');
    } else {
      setContextMenu({x:e.clientX,y:e.clientY,seatId}); 
    }
  };

  // 触屏长按处理开始长
  const handleTouchStart = (e: React.TouchEvent, seatId: number) => {
    e.stopPropagation();
    e.preventDefault();
    // 清除可能存在的旧定时
    const existingTimer = longPressTimerRef.current.get(seatId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    // 添加长按状态用于视觉反馈
    setLongPressingSeats(prev => new Set(prev).add(seatId));
    longPressTriggeredRef.current.delete(seatId);
    // 获取触摸位置
    const touch = e.touches[0];
    // 设置0.2秒后触发右键菜单/酒鬼伪装
    const timer = setTimeout(() => {
      const seat = seats.find(s => s.id === seatId);
      if (gamePhase === 'check' && seat?.role?.id === 'drunk') {
        setShowDrunkModal(seatId);
      } else {
        openContextMenuForSeat(seatId, 'center');
      }
      longPressTriggeredRef.current.add(seatId);
      longPressTimerRef.current.delete(seatId);
      setLongPressingSeats(prev => {
        const next = new Set(prev);
        next.delete(seatId);
        return next;
      });
    }, 200);
    longPressTimerRef.current.set(seatId, timer);
  };

  // 触屏长按处理结束触摸取消长按
  const handleTouchEnd = (e: React.TouchEvent, seatId: number) => {
    e.stopPropagation();
    e.preventDefault();
    const timer = longPressTimerRef.current.get(seatId);
    if (timer) {
      clearTimeout(timer);
      longPressTimerRef.current.delete(seatId);
      // 若未触发长按视为一次点击用于触屏落座/选中
      if (!longPressTriggeredRef.current.has(seatId)) {
        handleSeatClick(seatId);
      }
    }
    // 清除长按状
    setLongPressingSeats(prev => {
      const next = new Set(prev);
      next.delete(seatId);
      return next;
    });
  };

  // 触屏长按处理触摸移动取消长按
  const handleTouchMove = (e: React.TouchEvent, seatId: number) => {
    e.stopPropagation();
    e.preventDefault();
    const timer = longPressTimerRef.current.get(seatId);
    if (timer) {
      clearTimeout(timer);
      longPressTimerRef.current.delete(seatId);
    }
    // 清除长按状
    setLongPressingSeats(prev => {
      const next = new Set(prev);
      next.delete(seatId);
      return next;
    });
  };

  const canToggleRedHerring = useCallback((seatId: number) => {
    const seat = seats.find(s => s.id === seatId);
    if (!seat || !seat.role) return false;
    if (['minion', 'demon'].includes(seat.role.type)) return false;
    const hasFortuneTeller = seats.some(s => s.role?.id === 'fortune_teller');
    return hasFortuneTeller;
  }, [seats]);

  const clearCheckLongPressTimer = () => {
    if (checkLongPressTimerRef.current) {
      clearTimeout(checkLongPressTimerRef.current);
      checkLongPressTimerRef.current = null;
    }
  };

  const handleCheckTouchStart = (e: React.TouchEvent, seatId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canToggleRedHerring(seatId)) return;
    clearCheckLongPressTimer();
    checkLongPressTimerRef.current = setTimeout(() => {
      toggleStatus('redherring', seatId);
      clearCheckLongPressTimer();
    }, 200);
  };

  const handleCheckTouchEnd = (e: React.TouchEvent, seatId: number) => {
    e.preventDefault();
    e.stopPropagation();
    clearCheckLongPressTimer();
  };

  const handleCheckTouchMove = (e: React.TouchEvent, seatId: number) => {
    e.preventDefault();
    e.stopPropagation();
    clearCheckLongPressTimer();
  };

  const handleCheckContextMenu = (e: React.MouseEvent, seatId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canToggleRedHerring(seatId)) return;
    toggleStatus('redherring', seatId);
  };

  // insertIntoWakeQueueAfterCurrent and convertPlayerToEvil are now imported from useGameController

  const handleMenuAction = (action: string) => {
    if(!contextMenu) return;
    if(action==='nominate') { 
      // 只能在黄昏环节提名
      if (gamePhase !== 'dusk') {
        // 5. 屏蔽浏览器弹窗使用控制台提示
        setContextMenu(null);
        return;
      }
      setShowDayActionModal({ type: 'nominate', sourceId: contextMenu.seatId });
    } else if(action==='slayer') {
      // 开枪可以在任意环节除了setup阶段
      const shooter = seats.find(s => s.id === contextMenu.seatId);
      if (!shooter || shooter.hasUsedSlayerAbility) {
        setContextMenu(null);
        return;
      }
      setShowDayActionModal({ type: 'slayer', sourceId: contextMenu.seatId });
    } else if (action === 'damselGuess') {
      const seat = seats.find(s => s.id === contextMenu.seatId);
      const hasDamsel = seats.some(s => s.role?.id === 'damsel');
      const alreadyUsed = damselGuessUsedBy.includes(contextMenu.seatId);
      if (!seat || seat.role?.type !== 'minion' || seat.isDead || !hasDamsel || alreadyUsed || gamePhase !== 'day') {
        setContextMenu(null);
        return;
      }
      setShowDamselGuessModal({ minionId: contextMenu.seatId, targetId: null });
    }
    setContextMenu(null);
  };

  const toggleStatus = (type: string, seatId?: number) => {
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
  };

  const confirmRavenkeeperFake = (r: Role) => {
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
  };

  // 注意此函数已不再使用守鸦人的结果现在直接显示在控制台
  // 保留此函数仅为了兼容性但不会被调用
  const confirmRavenkeeperResult = () => {
    // 此函数已废弃不再使用
    setShowRavenkeeperResultModal(null);
  };

  // 注意此函数已不再使用处女的逻辑现在handleDayAction 中直接处理
  // 保留此函数仅为了兼容性但不会被调用
  const confirmVirginTrigger = () => {
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
  };

  const handleRestart = () => {
    setShowRestartConfirmModal(true);
  };

  const confirmRestart = () => {
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
  };

  // 切换剧本如果游戏正在进行先结束游戏并保存记录
  const handleSwitchScript = () => {
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
  };

  // 重置游戏到setup阶段再来一局
  const handleNewGame = () => {
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
  };

  // ===========================
  //      使用角色行动 Hook
  // ===========================
  const { executeAction } = useRoleAction();

  // 9.1 控制面板上一只退回流程不改变已生成的信
  // 支持无限次后退直到当前夜阶段的开
  const handleStepBack = () => {
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
  };
  
  // 9.2 全局上一步撤销当前动作清除缓存重新生成信息
  // 支持无限次撤回直到"选择剧本"页面
  const handleGlobalUndo = () => {
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
  };

  // --- Render ---
  // 人数小于等于 9 时放大座位及文字
  const seatScale = seats.length <= 9 ? 1.3 : 1;

  const currentNightNumber = gamePhase === 'firstNight' ? 1 : nightCount;
  const currentWakeSeat = nightInfo ? seats.find(s => s.id === nightInfo.seat.id) : null;
  const nextWakeSeatId = (gamePhase === 'firstNight' || gamePhase === 'night') && currentWakeIndex + 1 < wakeQueueIds.length ? wakeQueueIds[currentWakeIndex + 1] : null;
  const nextWakeSeat = nextWakeSeatId !== null ? seats.find(s => s.id === nextWakeSeatId) : null;
  const getDisplayRole = (seat: Seat | null | undefined) => {
    if (!seat) return null;
    const base = seat.role?.id === 'drunk' ? seat.charadeRole : seat.role;
    return base;
  };
  const currentWakeRole = getDisplayRole(currentWakeSeat);
  const nextWakeRole = getDisplayRole(nextWakeSeat);
  
  if (!mounted) return null;
  
  return (
    <>
      <PortraitLock />
      <div 
        className="fixed inset-0 text-white overflow-hidden"
        style={{
          background: gamePhase==='day'?'rgb(12 74 110)':gamePhase==='dusk'?'rgb(28 25 23)':'rgb(3 7 18)'
        }}
        onClick={()=>{setContextMenu(null);setShowMenu(false);}}
      >
      {/* ===== 通用加载动画不属于暗流涌动等具体剧本===== */}
      {showIntroLoading && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black">
          <div className="font-sans text-5xl md:text-7xl font-black tracking-[0.1em] text-red-400 animate-breath-shadow">
            拜甘
          </div>
          <div className="mt-8 flex flex-col items-center gap-3">
            <div className="h-10 w-10 rounded-full border-4 border-red-500 border-t-transparent animate-spin" />
            <div className="text-base md:text-lg font-semibold text-red-200/90 font-sans tracking-widest">
              祈祷
            </div>
          </div>
        </div>
      )}
      {compositionError && (
        <div className="fixed inset-0 z-[9900] bg-black/70 flex items-center justify-center px-4">
          <div className="bg-gray-900 border-4 border-red-500 rounded-2xl p-6 max-w-xl w-full space-y-4 shadow-2xl">
            <div className="text-xl font-bold text-red-400">阵容配置错误</div>
            {compositionError.hasBaron ? (
              <div className="text-sm leading-6 text-gray-100 space-y-3">
                <p className="font-semibold text-yellow-300">
                  场上存在男爵：</p>
                <p>
                  {compositionError.playerCount} 人局时外来者应<span className="font-bold text-yellow-200">{compositionError.standard.outsider} </span>
                  {(() => {
                    // 从标准配置表中查找基础配置无男爵时的配置
                    const basePreset = troubleBrewingPresets.find(p => p.total === compositionError.playerCount);
                    const baseOutsider = basePreset?.outsider ?? 0;
                    return `而不是${baseOutsider}名`;
                  })()}
                </p>
                <p className="font-semibold text-yellow-200">
                  请增加2名外来者从镇民中替换或者移除男爵后再开始游戏
                </p>
                <div className="text-sm text-gray-300 space-y-2 bg-gray-800/60 rounded-lg p-3 border border-gray-700 mt-3">
                  <div className="font-semibold mb-1">当前配置</div>
                  <div>
                    {compositionError.actual.townsfolk} 镇民 / {compositionError.actual.outsider} 外来者 {compositionError.actual.minion} 爪牙 / {compositionError.actual.demon} 恶魔
                  </div>
                  <div className="font-semibold mt-2 mb-1">标准配置应为含男爵</div>
                  <div>
                    {compositionError.standard.townsfolk} 镇民 / {compositionError.standard.outsider} 外来者 {compositionError.standard.minion} 爪牙 / {compositionError.standard.demon} 恶魔
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm leading-6 text-gray-100 space-y-3">
                <p>
                  当前<span className="font-bold text-white">{compositionError.playerCount} 人局</span>标准配置应
                  <span className="font-semibold text-yellow-200">
                    {compositionError.standard.townsfolk} 镇民 / {compositionError.standard.outsider} 外来者 {compositionError.standard.minion} 爪牙 / {compositionError.standard.demon} 恶魔
                  </span>
                </p>
                <p>
                  你现在的配置
                  <span className="font-semibold text-red-300">
                    {compositionError.actual.townsfolk} 镇民 / {compositionError.actual.outsider} 外来者 {compositionError.actual.minion} 爪牙 / {compositionError.actual.demon} 恶魔
                  </span>
                </p>
                <p className="text-sm text-gray-300 font-semibold">
                  请调整角色数量后再点击开始游戏
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  // 在重置前安全地打印当前错误信息避免 compositionError null 时输{}
                  setCompositionError(prev => {
                    if (prev) {
                      // 使用 console.warn 避免Next/React 视为错误而弹Error Overlay
                      console.warn('阵容配置错误', {
                        当前配置: prev.actual,
                        标准配置: prev.standard,
                        人数: prev.playerCount,
                        有男爵: prev.hasBaron,
                      });
                    } else {
                      console.error('阵容配置错误，状态已重置，无法获取详细信息');
                    }
                    return null;
                  });
                }}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 transition"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
      {baronSetupCheck && (
        <div className="fixed inset-0 z-[9900] bg-black/70 flex items-center justify-center px-4">
          <div className="bg-gray-900 border-4 border-yellow-500 rounded-2xl p-6 max-w-xl w-full space-y-4 shadow-2xl">
            <div className="text-xl font-bold text-yellow-300"> Setup 校验</div>
            <p className="text-sm leading-6 text-gray-100">
              检测到你选择了男(Baron)但当前镇外来者 ? 数量不符规则
            </p>
            <div className="text-sm text-gray-200 space-y-2 bg-gray-800/60 rounded-lg p-3 border border-gray-700">
              <div>当前{baronSetupCheck.current.townsfolk} 个镇民{baronSetupCheck.current.outsider} 个外来者</div>
              <div className="font-semibold text-yellow-200">
                建议调整为{baronSetupCheck.recommended.townsfolk} 个镇民{baronSetupCheck.recommended.outsider} 个外来者
              </div>
              <div className="text-xs text-gray-400">
                共 {baronSetupCheck.recommended.total} 人局含男爵自动2 名镇民替换为 2 名外来者
              </div>
            </div>
            <p className="text-sm text-gray-300">
              你可以点击"自动重排"由系统重新分配，点击"我手动调整"后再继续，或在说书人裁量下点击"保持当前配置"直接开始游戏
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleBaronAutoRebalance}
                className="flex-1 py-3 rounded-xl bg-yellow-500 text-black font-bold hover:bg-yellow-400 transition"
              >
                自动重排
              </button>
              <button
                onClick={() => setBaronSetupCheck(null)}
                className="flex-1 py-3 rounded-xl bg-gray-700 text-gray-100 font-bold hover:bg-gray-600 transition"
              >
                我手动调 : </button>
              <button
                onClick={() => {
                  setIgnoreBaronSetup(true);
                  setBaronSetupCheck(null);
                }}
                className="flex-1 py-3 rounded-xl bg-gray-800 text-gray-100 font-bold hover:bg-gray-700 transition"
              >
                保持当前配置
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ===== 暗流涌动剧本游戏第一部分主界面 ===== */}
      <GameStage>
        {/* 使用 Flex 布局填1600x800 */}
        <div className="w-full h-full flex flex-col bg-slate-950 text-white">
          
          {/* 区域 1: 顶部*/}
          <GameHeader
            onShowGameRecords={() => setShowGameRecordsModal(true)}
            onShowReview={() => setShowReviewModal(true)}
            onShowRoleInfo={() => setShowRoleInfoModal(true)}
            onSwitchScript={handleSwitchScript}
            onRestart={handleRestart}
            showMenu={showMenu}
            onToggleMenu={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            onCloseMenu={() => setShowMenu(false)}
          />

          {/* 主内容区域左右布局 */}
          <div className="flex-1 flex min-h-0">
            {/* === 左侧圆桌区(自适应宽度高度填 === */}
            <GameBoard
                        seats={seats}
              gamePhase={gamePhase}
              timer={timer}
                        nightInfo={nightInfo}
                        selectedActionTargets={selectedActionTargets}
              isPortrait={isPortrait}
              seatScale={seatScale}
                        longPressingSeats={longPressingSeats}
              seatContainerRef={seatContainerRef}
              seatRefs={seatRefs}
              handleSeatClick={handleSeatClick}
              handleContextMenu={handleContextMenu}
              handleTouchStart={handleTouchStart}
              handleTouchEnd={handleTouchEnd}
              handleTouchMove={handleTouchMove}
              handleGlobalUndo={handleGlobalUndo}
                        getSeatPosition={getSeatPosition}
                        getDisplayRoleType={getDisplayRoleType}
              formatTimer={formatTimer}
              setSeatRef={(id, el) => { seatRefs.current[id] = el; }}
                        typeColors={typeColors}
              setShowSpyDisguiseModal={setShowSpyDisguiseModal}
                      />

            {/* === 右侧侧边栏 (固定宽度) === */}
            <aside className="w-[450px] h-full border-l border-white/10 bg-slate-900/50 flex flex-col relative z-20 shrink-0 overflow-hidden">
            <div className="px-4 py-2 border-b border-white/10 shrink-0 h-16 flex items-center">
              <h2 className="text-lg font-bold text-purple-300"> 说书人控制台</h2>
            </div>
            {nightInfo && (
              <div className="px-4 py-2 border-b border-white/10 bg-slate-900/50 shrink-0">
                <span 
                  ref={currentActionTextRef}
                  className="text-sm font-bold text-white block text-center"
                >
                  当前是第{currentNightNumber}夜轮到
                  <span className="text-yellow-300">
                    {nightInfo.seat.id+1}号{currentWakeRole?.name || nightInfo.effectiveRole.name}
                  </span>
                  行动
                  <br />
                  下一个将
                  <span className="text-cyan-300">
                    {nextWakeSeat && nextWakeRole ? `${nextWakeSeat.id+1}号(${nextWakeRole.name})` : '本夜结束'}
                  </span>
                  
                </span>
              </div>
            )}
            <div ref={consoleContentRef} className="flex-1 overflow-y-auto p-4 text-sm min-h-0">
              {/* 剧本选择页面 */}
              {gamePhase==='scriptSelection' && (
            <div className="flex flex-col items-center justify-center min-h-full">
              <h2 className="text-4xl font-bold mb-2 text-white">选择剧本</h2>
              <p className="text-gray-400 italic mb-8">更多剧本开发中</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
                {scripts.map(script => (
                  <button
                    key={script.id}
                    onClick={() => {
                      // 保存选择剧本前的状态到历史记录
                      saveHistory();
                      setSelectedScript(script);
                      setGameLogs([]); // 选择新剧本时清空之前的游戏记
                      setGamePhase('setup');
                    }}
                    className="p-8 bg-gray-800 border-4 border-gray-600 rounded-2xl hover:border-blue-500 hover:bg-gray-700 transition-all text-center flex flex-col items-center justify-center"
                  >
                    <div className="text-2xl font-bold text-white mb-2">{script.name}</div>
                    <div className="text-sm text-gray-400">难度{script.difficulty}</div>
                  </button>
                ))}
              </div>
            </div>
              )}
              {/* 4. 白天控制台增加说书人提示 */}
              {gamePhase==='day' && (
                <div className="mb-4 p-3 bg-gray-800/50 border border-yellow-500/30 rounded-lg text-sm text-gray-300 leading-relaxed">
                  <p className="mb-2 font-bold text-yellow-400 text-sm"> 说书人提示</p>
                  <p className="mb-2 text-xs">你的目标是主持一场有趣好玩且参与度高的游戏</p>
                  <p className="mb-2 text-xs">有些事你可以做但不意味着你应该去做你是否只顾自己取乐而给玩家们添乱你是否正在牺牲玩家的乐趣来放纵自己比如说当小恶魔在夜里将自己杀死时你"可以"将陌客当作是爪牙并让他因此变成一个善良的小恶魔但这并不意味着这样做是有趣或平衡的比如说可以"说服一名迷惑的善良阵营玩家告诉他他是邪恶阵营的但这并不意味着玩家在得知真相后会享受这个过程又比如说你"可以"给博学者提供完全没用的信息但显然提供有趣且独特的信息会更好</p>
                  <p className="mb-2 text-xs">作为说书人你在每一局游戏当中都需要做出很多有趣的决定而这每一个决定的目的都应该是使游戏变得更好玩为大家带来更多乐趣这通常意味着你需要给善良阵营制造尽可能多的混乱将他们引入歧途因为这对所有人来说都是有趣的但请牢记在心维持游戏的公平性是同样重要的你主持游戏是为了让玩家都能够享受到游戏中的精彩</p>
                </div>
              )}
          {gamePhase==='day' && (() => {
            const dayAbilityConfigs: DayAbilityConfig[] = [
              {
                roleId: 'savant_mr',
                title: '博学者每日提问',
                description: '每个白天一次向说书人索取一真一假的两条信息',
                usage: 'daily',
                logMessage: seat => `${seat.id+1}号(博学者) 使用今日提问，请准备一真一假两条信息`
              },
              {
                roleId: 'amnesiac',
                title: '失意者每日猜测',
                description: '每个白天一次向说书人提交本回合的猜测并获得反馈',
                usage: 'daily',
                logMessage: seat => `${seat.id+1}失意 提交今日猜测请给出反馈`
              },
              {
                roleId: 'fisherman',
                title: '渔夫灵感',
                description: '每局一次向说书人索取获胜建议',
                usage: 'once',
                logMessage: seat => `${seat.id+1}渔夫) 使用一次性灵感请提供获胜建议`
              },
              {
                roleId: 'engineer',
                title: '工程师改造',
                description: '每局一次改造恶魔或爪牙阵营，请手动选择变更',
                usage: 'once',
                logMessage: seat => `${seat.id+1}工程 启动改装请根据需求手动调整恶爪牙`
              },
              {
                roleId: 'lunatic_mr',
                title: '精神病患者日杀',
                description: '提名前公开杀死一名玩家处决时需与提名者猜拳决定生死',
                usage: 'daily',
                actionType: 'lunaticKill',
                logMessage: seat => `${seat.id+1}号(精神病患者) 准备发动日间杀人`
              }
            ];
            const entries = seats
              .filter(s => s.role && dayAbilityConfigs.some(c => c.roleId === s.role!.id))
              .map(seat => {
                const config = dayAbilityConfigs.find(c => c.roleId === seat.role?.id);
                return config ? { seat, config } : null;
              })
              .filter((v): v is { seat: Seat; config: DayAbilityConfig } => !!v);
            if (entries.length === 0) return null;
            return (
              <div className="mb-4 p-3 bg-gray-800/40 border border-blue-500/30 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-blue-300"> 白天主动技能</p>
                  <span className="text-xs text-gray-400">每日/一次性能力快速触发</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {entries.map(({ seat, config }) => {
                    const used = config.usage === 'once'
                      ? hasUsedAbility(config.roleId, seat.id)
                      : hasUsedDailyAbility(config.roleId, seat.id);
                    const disabled = seat.isDead || used;
                    const statusLabel = seat.isDead
                      ? '已死'
                      : used
                        ? (config.usage === 'once' ? '已用' : '今日已用')
                        : '可使用';
                    return (
                      <div key={`${config.roleId}-${seat.id}`} className="p-3 border border-gray-700 rounded-lg bg-gray-900/40">
                        <div className="flex items-center justify-between mb-1">
                          <div className="font-bold text-white">{seat.id+1}{seat.role?.name}</div>
                          <span className="text-xs text-gray-400">{statusLabel}</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-2 leading-relaxed">{config.description}</p>
                        <button
                          onClick={() => handleDayAbilityTrigger(seat, config)}
                          disabled={disabled}
                          className={`w-full py-2 rounded-lg text-sm font-bold transition ${
                            disabled ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'
                          }`}
                        >
                          触发
                        </button>
                      </div>
                    );
                  })}
                </div>
                {dayAbilityLogs.length > 0 && (
                  <div className="mt-3 space-y-1 text-xs text-gray-300">
                    <div className="font-bold text-blue-200">今日反馈记录</div>
                    {dayAbilityLogs
                      .filter(l => l.day === nightCount)
                      .map((l, idx) => (
                        <div key={`${l.roleId}-${l.id}-${idx}`} className="px-2 py-1 bg-gray-800/60 rounded border border-gray-700">
                          {l.id+1}{getSeatRoleId(seats.find(s=>s.id===l.id)) === l.roleId ? '' : ''}{roles.find(r=>r.id===l.roleId)?.name || l.roleId}{l.text}
                        </div>
                      ))}
                    {dayAbilityLogs.filter(l => l.day === nightCount).length === 0 && (
                      <div className="text-gray-500">尚无记录</div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          {gamePhase==='day' && !damselGuessed && seats.some(s=>s.role?.type==='minion' && !s.isDead && !damselGuessUsedBy.includes(s.id)) && seats.some(s=>s.role?.id==='damsel') && (
            <div className="mb-4 p-3 bg-gray-800/40 border border-pink-500/40 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-pink-300"> 爪牙猜测落难少女</p>
                <span className="text-xs text-gray-400">每名爪牙每局一次猜中则邪恶立刻获胜</span>
              </div>
              <button
                onClick={()=>setShowDamselGuessModal({ minionId: null, targetId: null })}
                className="w-full py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-bold text-sm"
              >
                发起猜测
              </button>
            </div>
          )}
          {gamePhase==='day' && shamanKeyword && !shamanTriggered && (
            <div className="mb-4 p-3 bg-gray-800/40 border border-purple-500/40 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-purple-300"> 灵言师关键词已被说出</p>
                <span className="text-xs text-gray-400">选择第一个说出关键词的善良玩</span>
              </div>
              <button
                onClick={()=>setShowShamanConvertModal(true)}
                className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm"
              >
                触发阵营转换
              </button>
            </div>
          )}
          {gamePhase==='setup' && (() => {
            // 计算各阵营数
            const playerCount = seats.filter(s => s.role !== null).length;
            const actualTownsfolkCount = seats.filter(s => s.role?.type === 'townsfolk').length;
            const actualOutsiderCount = seats.filter(s => s.role?.type === 'outsider').length;
            const actualMinionCount = seats.filter(s => s.role?.type === 'minion').length;
            const actualDemonCount = seats.filter(s => s.role?.type === 'demon').length;
            
            // 检查影响外来者数量的角色
            const hasBaron = seats.some(s => s.role?.id === 'baron');
            const hasGodfather = seats.some(s => s.role?.id === 'godfather');
            const hasFangGu = seats.some(s => s.role?.id === 'fang_gu');
            const hasVigormortis = seats.some(s => s.role?.id === 'vigormortis' || s.role?.id === 'vigormortis_mr');
            const hasBalloonist = seats.some(s => s.role?.id === 'balloonist');
            
            // 基于"保持当前村民数量不变"计算建议
            // 血染钟楼规则
            // - 外来者数 = floor(总玩家数 / 3) + 修正
            // - 爪牙= floor((总玩家数 - 3) / 2)
            // - 恶魔= 1
            // - 总玩家数 = 村民+ 外来者数 + 爪牙+ 恶魔
            
            const calculateRecommendations = (townsfolkCount: number) => {
            const recommendations: Array<{
              outsider: number;
              minion: number;
              demon: number;
              total: number;
              modifiers: string[];
              note?: string;
            }> = [];

            // 以村民数为基准的官方建议
            const presets = [
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
              { total: 15, townsfolk: 9, outsider: 2, minion: 3, demon: 1 },
            ];

            presets
              .filter(p => p.townsfolk === townsfolkCount)
              .forEach(p => {
                recommendations.push({
                  outsider: p.outsider,
                  minion: p.minion,
                  demon: p.demon,
                  total: p.total,
                  modifiers: [],
                  note: `总人{p.total}人`,
                });
              });

            recommendations.sort((a, b) => a.total - b.total);

            return recommendations.slice(0, 5); // 最多显个建
            };
            
            const recommendations = calculateRecommendations(actualTownsfolkCount);
            
            // 检查当前配置是否匹配某个建
            const currentMatch = recommendations.find(r => 
              r.outsider === actualOutsiderCount &&
              r.minion === actualMinionCount &&
              r.demon === actualDemonCount
            );
            
            const isValid = currentMatch !== undefined;
            
            return (
              <div className="space-y-6">
                {/* 阵营角色数量校验提示 */}
                {actualTownsfolkCount > 0 && (
                  <div className={`p-4 rounded-lg border-2 ${isValid ? 'bg-green-900/30 border-green-500 text-green-200' : 'bg-yellow-900/30 border-yellow-500 text-yellow-200'}`}>
                    <div className="font-bold mb-2"> 阵营角色数量建议</div>
                    <div className="text-sm space-y-1">
                      <div>当前村民数{actualTownsfolkCount}人保持不变</div>
                      <div className="mt-2 font-semibold">建议配置</div>
                      {recommendations.length > 0 ? (
                        <div className="space-y-1 ml-2">
                          {recommendations.map((rec, idx) => {
                            const isCurrent = rec.outsider === actualOutsiderCount && 
                                            rec.minion === actualMinionCount && 
                                            rec.demon === actualDemonCount;
                            return (
                              <div key={idx} className={isCurrent ? 'text-green-300 font-bold' : ''}>
                                {rec.outsider}外来者{rec.minion}爪牙{rec.demon}恶魔
                                {rec.note && <span className="text-xs opacity-75 ml-1">{rec.note}</span>}
                                {isCurrent && <span className="ml-2">当前配置</span>}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-xs opacity-75 ml-2">无有效配置</div>
                      )}
                      <div className="mt-2 text-xs opacity-75">
                        实际{actualOutsiderCount}外来者{actualMinionCount}爪牙{actualDemonCount}恶魔
                      </div>
                      {!isValid && (
                        <div className="mt-2 text-yellow-300 font-bold"> 当前配置不在建议范围内</div>
                      )}
                    </div>
                  </div>
                )}
                {Object.entries(filteredGroupedRoles).map(([type, list]) => (
                  <div key={type}>
                    <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">{typeLabels[type] || type}</h3>
                    <div className="grid grid-cols-3 gap-3">
                      {list.map(r=>{
                        const isTaken=seats.some(s=>s.role?.id===r.id);
                        return (
                          <button 
                            key={r.id} 
                            onClick={(e)=>{e.stopPropagation();if(!isTaken)setSelectedRole(r)}} 
                            className={`p-3 border rounded-lg text-sm font-medium transition-all ${
                              isTaken ? 'opacity-30 cursor-not-allowed bg-gray-800':'' 
                            } ${typeBgColors[r.type]} ${
                              selectedRole?.id===r.id ? 'ring-4 ring-white scale-105':''
                            }`}
                          >
                            {r.name}
                          </button>
                        );
                      })}
                        </div>
                        </div>
                ))}
                    </div>
            );
          })()}
          
          {gamePhase==='check' && (
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-4">核对身份</h2>
              {autoRedHerringInfo && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/40 border border-red-500 text-red-200 font-semibold">
                   红罗刹自动分配{autoRedHerringInfo}
                </div>
              )}
              {selectedScript && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-gray-800/80 border border-yellow-500/70 text-left text-sm text-gray-100 space-y-1">
                  <div className="font-bold text-yellow-300 mb-1"> 夜晚行动说明({selectedScript.name})</div>
                  {(() => {
                    const scriptRoles = roles.filter(r => {
                      if (selectedScript.id === 'trouble_brewing') return !r.script;
                      if (selectedScript.id === 'bad_moon_rising') return r.script === '暗月初升';
                      if (selectedScript.id === 'sects_and_violets') return r.script === '梦陨春宵';
                      if (selectedScript.id === 'midnight_revelry') return r.script === '夜半狂欢';
                      return false;
                    });
                    const onlyFirst = scriptRoles.filter(r => r.firstNight && !r.otherNight);
                    const onlyOther = scriptRoles.filter(r => !r.firstNight && r.otherNight);
                    const bothNights = scriptRoles.filter(r => r.firstNight && r.otherNight);
                    const passive = scriptRoles.filter(r => !r.firstNight && !r.otherNight);
                    const renderLine = (label: string, list: typeof scriptRoles) => {
                      if (!list.length) return null;
                      return (
                        <div>
                          <span className="font-semibold">{label}</span>
                          <span className="text-gray-300">
                            {list.map(r => r.name).join('、')}
                          </span>
                        </div>
                      );
                    };
                    return (
                      <>
                        {renderLine('只在首夜被唤醒的角色', onlyFirst)}
                        {renderLine('只在之后夜晚被唤醒的角色', onlyOther)}
                        {renderLine('首夜和之后夜晚都会被唤醒的角色', bothNights)}
                        {renderLine('从不在夜里被唤醒但始终生效的角色', passive)}
                      </>
                    );
                  })()}
                  <div className="text-xs text-gray-400 mt-1">
                    提示若某角色今晚未被叫醒通常是因为规则只在首夜或之后夜晚才叫醒而非程序漏掉
                  </div>
                </div>
              )}
              <div className="bg-gray-800 p-4 rounded-xl text-left text-base space-y-3 max-h-[80vh] overflow-y-auto check-identity-scrollbar">
                {seats.filter(s=>s.role).map(s=>{
                  // 酒鬼应该显示伪装角色的名称而不是酒鬼
                  const displayRole = s.role?.id === 'drunk' && s.charadeRole ? s.charadeRole : s.role;
                  const displayName = displayRole?.name || '';
                  const canRedHerring = canToggleRedHerring(s.id);
                  return (
                    <div 
                      key={s.id} 
                      className="flex flex-col gap-1 border-b border-gray-700 pb-2 select-none"
                      style={{ 
                        WebkitUserSelect: 'none', 
                        userSelect: 'none',
                        WebkitTouchCallout: 'none',
                        touchAction: 'manipulation',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                      onContextMenu={(e)=>handleCheckContextMenu(e, s.id)}
                      onTouchStart={(e)=>handleCheckTouchStart(e, s.id)}
                      onTouchEnd={(e)=>handleCheckTouchEnd(e, s.id)}
                      onTouchMove={(e)=>handleCheckTouchMove(e, s.id)}
                    >
                      <div className="flex justify-between">
                        <span>{s.id+1}</span>
                        <span className={s.role?.type==='demon' ? 'text-red-500 font-bold' : ''}>
                          {displayName}
                          {s.role?.id==='drunk' && <span className="text-gray-400 text-sm">(酒鬼)</span>}
                          {s.isRedHerring && ' [红罗刹]'}
                          {!canRedHerring && s.isRedHerring && <span className="text-xs text-gray-500 ml-1">(仅占卜师在场可更改)</span>}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[11px] text-gray-300">
                        {s.statusDetails?.length ? (
                          s.statusDetails.map(st => (
                            <span key={st} className={`px-2 py-0.5 rounded bg-gray-700 text-yellow-300 border border-gray-600 ${st.includes('投毒') ? 'whitespace-nowrap' : ''}`}>{st}</span>
                          ))
                        ) : (
                          <span className="text-gray-500">无特殊状态</span>
                        )}
                        {s.isDead && (
                          <button
                            type="button"
                            onClick={() => setSeats(p => p.map(x => x.id === s.id ? { ...x, hasGhostVote: x.hasGhostVote === false ? true : false } : x))}
                            className={`px-2 py-0.5 rounded border text-[11px] ${
                              s.hasGhostVote === false
                                ? 'bg-gray-700 border-gray-600 text-gray-400'
                                : 'bg-indigo-900/60 border-indigo-500 text-indigo-100'
                            }`}
                            title="死者票点击切换已未用"
                          >
                            死者票{(s.hasGhostVote === false) ? '已用' : ''}
                          </button>
                        )}
                        {s.hasUsedSlayerAbility && (
                          <span className="px-2 py-0.5 rounded bg-red-900/60 text-red-200 border border-red-700">猎手已用</span>
                        )}
                        {s.hasUsedVirginAbility && (
                          <span className="px-2 py-0.5 rounded bg-purple-900/60 text-purple-200 border border-purple-700">处女已失能</span>
                        )}
                        {s.hasAbilityEvenDead && (
                          <span className="px-2 py-0.5 rounded bg-green-900/60 text-green-200 border border-green-700">死而有</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {(gamePhase==='firstNight'||gamePhase==='night') && showMinionKnowDemonModal ? (() => {
            const minionSeats = seats.filter(s => s.role?.type === 'minion').map(s => s.id + 1);
            const minionSeatsText = minionSeats.length > 0 ? minionSeats.join('号和') + '号' : '';
            return (
            <div className="space-y-4 animate-fade-in mt-10">
              <div className="p-4 rounded-xl border-2 bg-purple-900/20 border-purple-500">
                <div className="text-xl font-bold text-purple-300 mb-4"> 爪牙集体的行动</div>
                <div className="mb-2 text-sm text-gray-400 font-bold uppercase"> 指引</div>
                <p className="text-base mb-4 leading-relaxed whitespace-pre-wrap font-medium">
                  现在请同时唤醒{minionSeatsText}爪牙告诉他们恶魔是{showMinionKnowDemonModal.demonSeatId + 1}号玩家
                </p>
                <div className="text-sm text-gray-200 space-y-2 bg-gray-800/60 rounded-lg p-3 border border-gray-700 mb-4">
                  <div className="font-semibold text-purple-300 mb-2">恶魔位置</div>
                  <div className="text-lg font-bold text-yellow-300">
                    {showMinionKnowDemonModal.demonSeatId + 1}号玩家是恶魔
                  </div>
                </div>
                <div className="mb-2 text-sm text-yellow-400 font-bold uppercase">台词</div>
                <p className="text-lg font-serif bg-black/40 p-3 rounded-xl border-l-4 border-yellow-500 italic text-yellow-100">
                  "现在请你一次性叫醒所有爪牙并指向恶魔恶魔在 {showMinionKnowDemonModal.demonSeatId + 1} 号确认所有爪牙都知道恶魔的座位号后再让他们一起闭眼
                </p>
                <div className="mt-6">
                  <button
                    onClick={() => {
                      setShowMinionKnowDemonModal(null);
                      // 先移动到下一个行动然后继续
                      if(currentWakeIndex < wakeQueueIds.length - 1) { 
                        setCurrentWakeIndex(p => p + 1); 
                        setInspectionResult(null);
                        setSelectedActionTargets([]);
                        fakeInspectionResultRef.current = null;
                      } else {
                        // 夜晚结束显示死亡报
                        if(deadThisNight.length > 0) {
                          const deadNames = deadThisNight.map(id => `${id+1}号`).join('、');
                          setShowNightDeathReportModal(`昨晚${deadNames}玩家死亡`);
                        } else {
                          setShowNightDeathReportModal("昨天是个平安夜");
                        }
                      }
                    }}
                    className="w-full py-3 rounded-xl bg-purple-600 text-white font-bold hover:bg-purple-500 transition"
                  >
                    已告知继续
                  </button>
                </div>
              </div>
            </div>
            );
          })() : (gamePhase==='firstNight'||gamePhase==='night') && nightInfo ? (
            <div className="space-y-4 animate-fade-in mt-10">
              <div className={`p-4 rounded-xl border-2 ${
                currentHint.isPoisoned?'bg-red-900/20 border-red-500':'bg-gray-800 border-gray-600'
              }`}>
                {currentHint.isPoisoned && (
                  <div className="text-red-400 font-bold mb-3 text-base flex items-center gap-2">
                     {currentHint.reason}
                  </div>
                )}
                <div className="mb-2 text-sm text-gray-400 font-bold uppercase"> 指引</div>
                <p className="text-base mb-4 leading-relaxed whitespace-pre-wrap font-medium">{currentHint.guide}</p>
                <div className="mb-2 text-sm text-yellow-400 font-bold uppercase">台词</div>
                <p className="text-lg font-serif bg-black/40 p-3 rounded-xl border-l-4 border-yellow-500 italic text-yellow-100">
                  {currentHint.speak}
                </p>
              </div>
              
              {nightInfo.effectiveRole.nightActionType === 'spy_info' && (
                <div className="bg-black/50 p-3 rounded-xl h-[180%] overflow-y-auto text-xs flex gap-3">
                  <div className="w-1/2">
                    <h4 className="text-purple-400 mb-2 font-bold border-b pb-1 text-sm">魔典</h4>
                    {seats.filter(s=>s.role).map(s => (
                      <div key={s.id} className="py-0.5 border-b border-gray-700 flex justify-between">
                        <span>{s.id+1}</span>
                        <span className={s.role?.type==='demon' ? 'text-red-500' : ''}>
                          {s.role?.name}
                        </span>
    </div>
                    ))}
                  </div>
                  <LogViewer logs={gameLogs} />
                </div>
              )}
              
              {/* 7. 修复小恶魔选择问题 - 确保小恶魔在非首夜可以显示选择按钮 */}
              {nightInfo.effectiveRole.nightActionType!=='spy_info' && nightInfo.effectiveRole.nightActionType!=='none' && (
                <div className="grid grid-cols-3 gap-3 mt-4">
                  {seats.filter(s=>{
                    // 占卜师可以选择任意2名玩家包括自己和已死亡玩家
                    if (nightInfo.effectiveRole.id === 'fortune_teller') {
                      return s.role !== null; // 只要有角色就可以选择
                    }
                    // 小恶魔在非首夜可以选择任意活着的玩
                    if (nightInfo.effectiveRole.id === 'imp' && gamePhase !== 'firstNight') {
                      return s.role && !s.isDead;
                    }
                    // 僵怖可以选择任意活着的玩家包括假死状态的僵怖自己
                    if (nightInfo.effectiveRole.id === 'zombuul') {
                      // 僵怖假死状态算作存活
                      if (s.role?.id === 'zombuul' && s.isFirstDeathForZombuul && !s.isZombuulTrulyDead) {
                        return true;
                      }
                      return s.role && !s.isDead;
                    }
                    // 其他角色根据规则过滤
                    return s.role && (nightInfo.effectiveRole.id==='ravenkeeper' || !s.isDead);
                  }).map(s=>(
                    <button 
                      key={s.id} 
                      onClick={()=>toggleTarget(s.id)} 
                      disabled={isTargetDisabled(s)} 
                      className={`p-3 border-2 rounded-lg text-sm font-bold transition-all ${
                        selectedActionTargets.includes(s.id)
                          ? 'bg-green-600 border-white scale-105 shadow-lg ring-4 ring-green-500'
                          : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                      } ${isTargetDisabled(s) ? 'opacity-30 cursor-not-allowed':''}`}
                    >
                      [{s.id+1}] {s.role?.name}
                    </button>
                  ))}
                </div>
              )}
              
              {inspectionResult && (
                <div
                  key={inspectionResultKey}
                  className="bg-blue-600 p-4 rounded-xl text-center font-bold text-2xl shadow-2xl mt-4 animate-bounce"
                >
                  {inspectionResult}
                </div>
              )}
            </div>
          ) : ((gamePhase==='firstNight'||gamePhase==='night') && !nightInfo && (
            <div className="text-center text-gray-500 mt-20 text-xl">正在计算行动...</div>
          ))}
          
          {gamePhase==='dusk' && (
            <div className="mt-4 bg-gray-800 p-3 rounded-xl">
              <h3 className="text-lg font-bold mb-2 text-orange-400"> 处决</h3>
              {seats.filter(s=>s.isCandidate).sort((a,b)=>(b.voteCount||0)-(a.voteCount||0)).map((s,i)=>(
                <div 
                  key={s.id} 
                  className={`flex justify-between p-2 border-b border-gray-600 ${
                    i===0 ? 'text-red-400 font-bold' : ''
                  }`}
                >
                  <span>{s.id+1}{s.role?.name}</span>
                  <span>{s.voteCount}</span>
                </div>
              ))}
            </div>
          )}
            </div>
          </aside>

          </div>
          
          {/* 区域 4: 底部控制*/}
          <footer className="flex items-center justify-center h-20 border-t border-white/10 bg-slate-900/50 z-20 shrink-0">
            <ControlPanel
              gamePhase={gamePhase}
              seats={seats}
              currentWakeIndex={currentWakeIndex}
              history={history}
              isConfirmDisabled={isConfirmDisabled}
              evilTwinPair={evilTwinPair}
              remainingDays={remainingDays}
              setRemainingDays={setRemainingDays}
              cerenovusTarget={cerenovusTarget}
              nightCount={nightCount}
              onPreStartNight={handlePreStartNight}
              onStartNight={(isFirst) => nightLogic.startNight(isFirst)}
              onStepBack={handleStepBack}
              onConfirmAction={handleConfirmAction}
              onDayEndTransition={handleDayEndTransition}
              onExecuteJudgment={executeJudgment}
              onSetGamePhase={setGamePhase}
              onSetShowMadnessCheckModal={setShowMadnessCheckModal}
              onAddLog={addLog}
            />
          </footer>
        </div>
      </GameStage>
      </div>

      {/* Modals */}
      <GameModals
        showNightOrderModal={showNightOrderModal}
        showExecutionResultModal={showExecutionResultModal}
        showShootResultModal={showShootResultModal}
        showKillConfirmModal={showKillConfirmModal}
        showAttackBlockedModal={showAttackBlockedModal}
        showPitHagModal={showPitHagModal}
        showRangerModal={showRangerModal}
        showDamselGuessModal={showDamselGuessModal}
        showShamanConvertModal={showShamanConvertModal}
        showBarberSwapModal={showBarberSwapModal}
        showHadesiaKillConfirmModal={showHadesiaKillConfirmModal}
        showMayorRedirectModal={showMayorRedirectModal}
        showPoisonConfirmModal={showPoisonConfirmModal}
        showPoisonEvilConfirmModal={showPoisonEvilConfirmModal}
        showNightDeathReportModal={showNightDeathReportModal}
        showRestartConfirmModal={showRestartConfirmModal}
        showSpyDisguiseModal={showSpyDisguiseModal}
        showMayorThreeAliveModal={showMayorThreeAliveModal}
        showDrunkModal={showDrunkModal}
        showVoteInputModal={showVoteInputModal}
        showRoleSelectModal={showRoleSelectModal}
        showMadnessCheckModal={showMadnessCheckModal}
        showDayActionModal={showDayActionModal}
        virginGuideInfo={virginGuideInfo}
        showDayAbilityModal={showDayAbilityModal}
        showSaintExecutionConfirmModal={showSaintExecutionConfirmModal}
        showLunaticRpsModal={showLunaticRpsModal}
        showVirginTriggerModal={showVirginTriggerModal}
        showRavenkeeperFakeModal={showRavenkeeperFakeModal}
        showStorytellerDeathModal={showStorytellerDeathModal}
        showSweetheartDrunkModal={showSweetheartDrunkModal}
        showKlutzChoiceModal={showKlutzChoiceModal}
        showMoonchildKillModal={showMoonchildKillModal}
        showReviewModal={showReviewModal}
        showGameRecordsModal={showGameRecordsModal}
        showRoleInfoModal={showRoleInfoModal}
        contextMenu={contextMenu}
        gamePhase={gamePhase}
        winResult={winResult}
        winReason={winReason}
        deadThisNight={deadThisNight}
        nightOrderPreview={nightOrderPreview}
        nightQueuePreviewTitle={nightQueuePreviewTitle}
        shamanConvertTarget={shamanConvertTarget}
        mayorRedirectTarget={mayorRedirectTarget}
        spyDisguiseMode={spyDisguiseMode}
        spyDisguiseProbability={spyDisguiseProbability}
        klutzChoiceTarget={klutzChoiceTarget}
        voteInputValue={voteInputValue}
        showVoteErrorToast={showVoteErrorToast}
        voteRecords={voteRecords}
        dayAbilityForm={dayAbilityForm}
        damselGuessUsedBy={damselGuessUsedBy}
        hadesiaChoices={hadesiaChoices}
        selectedScript={selectedScript}
        seats={seats}
        roles={roles}
        filteredGroupedRoles={filteredGroupedRoles}
        groupedRoles={groupedRoles}
        gameLogs={gameLogs}
        gameRecords={gameRecords}
        isPortrait={isPortrait}
        nightInfo={nightInfo}
        selectedActionTargets={selectedActionTargets}
        initialSeats={initialSeats}
        nominationRecords={nominationRecords}
        evilTwinPair={evilTwinPair && 'evilId' in evilTwinPair ? [evilTwinPair.evilId, evilTwinPair.goodId] : null}
        remainingDays={remainingDays}
        cerenovusTarget={cerenovusTarget ? (typeof cerenovusTarget === 'number' ? cerenovusTarget : cerenovusTarget.targetId) : null}
        nightCount={nightCount}
        currentWakeIndex={currentWakeIndex}
        history={history}
        isConfirmDisabled={isConfirmDisabled}
        closeNightOrderPreview={closeNightOrderPreview}
        confirmNightOrderPreview={confirmNightOrderPreview}
        confirmExecutionResult={confirmExecutionResult}
        confirmShootResult={confirmShootResult}
        confirmKill={confirmKill}
        confirmPoison={confirmPoison}
        confirmPoisonEvil={confirmPoisonEvil}
        confirmNightDeathReport={confirmNightDeathReport}
        confirmRestart={confirmRestart}
        confirmHadesia={confirmHadesia}
        confirmMayorRedirect={confirmMayorRedirect}
        confirmStorytellerDeath={confirmStorytellerDeath}
        confirmSweetheartDrunk={confirmSweetheartDrunk}
        confirmKlutzChoice={confirmKlutzChoice}
        confirmMoonchildKill={confirmMoonchildKill}
        confirmRavenkeeperFake={confirmRavenkeeperFake}
        confirmVirginTrigger={confirmVirginTrigger}
        resolveLunaticRps={resolveLunaticRps}
        confirmSaintExecution={confirmSaintExecution}
        cancelSaintExecution={cancelSaintExecution}
        handleVirginGuideConfirm={handleVirginGuideConfirm}
        handleDayAction={handleDayAction}
        submitVotes={submitVotes}
        confirmDrunkCharade={confirmDrunkCharade}
        handleNewGame={handleNewGame}
        enterDuskPhase={enterDuskPhase}
        declareMayorImmediateWin={declareMayorImmediateWin}
        executePlayer={executePlayer}
        saveHistory={saveHistory}
        markDailyAbilityUsed={markDailyAbilityUsed}
        markAbilityUsed={markAbilityUsed}
        insertIntoWakeQueueAfterCurrent={insertIntoWakeQueueAfterCurrent}
        continueToNextAction={continueToNextAction}
        addLog={addLog}
        checkGameOver={checkGameOver}
        setShowKillConfirmModal={setShowKillConfirmModal}
        setShowPoisonConfirmModal={setShowPoisonConfirmModal}
        setShowPoisonEvilConfirmModal={setShowPoisonEvilConfirmModal}
        setShowHadesiaKillConfirmModal={setShowHadesiaKillConfirmModal}
        setShowRavenkeeperFakeModal={setShowRavenkeeperFakeModal}
        setShowMoonchildKillModal={setShowMoonchildKillModal}
        setShowBarberSwapModal={setShowBarberSwapModal}
        setShowStorytellerDeathModal={setShowStorytellerDeathModal}
        setShowSweetheartDrunkModal={setShowSweetheartDrunkModal}
        setShowKlutzChoiceModal={setShowKlutzChoiceModal}
        setShowPitHagModal={setShowPitHagModal}
        setShowRangerModal={setShowRangerModal}
        setShowDamselGuessModal={setShowDamselGuessModal}
        setShowShamanConvertModal={setShowShamanConvertModal}
        setShowMayorRedirectModal={setShowMayorRedirectModal}
        setShowNightDeathReportModal={setShowNightDeathReportModal}
        setShowRestartConfirmModal={setShowRestartConfirmModal}
        setShowSpyDisguiseModal={setShowSpyDisguiseModal}
        setShowMayorThreeAliveModal={setShowMayorThreeAliveModal}
        setShowDrunkModal={setShowDrunkModal}
        setShowVoteInputModal={setShowVoteInputModal}
        setShowRoleSelectModal={setShowRoleSelectModal}
        setShowMadnessCheckModal={setShowMadnessCheckModal}
        setShowDayActionModal={setShowDayActionModal}
        setVirginGuideInfo={setVirginGuideInfo}
        setShowDayAbilityModal={setShowDayAbilityModal}
        setShowSaintExecutionConfirmModal={setShowSaintExecutionConfirmModal}
        setShowLunaticRpsModal={setShowLunaticRpsModal}
        setShowVirginTriggerModal={setShowVirginTriggerModal}
        setShowReviewModal={setShowReviewModal}
        setShowGameRecordsModal={setShowGameRecordsModal}
        setShowRoleInfoModal={setShowRoleInfoModal}
        setContextMenu={setContextMenu}
        setShamanConvertTarget={setShamanConvertTarget}
        setMayorRedirectTarget={setMayorRedirectTarget}
        setSpyDisguiseMode={setSpyDisguiseMode}
        setSpyDisguiseProbability={setSpyDisguiseProbability}
        setKlutzChoiceTarget={setKlutzChoiceTarget}
        setVoteInputValue={setVoteInputValue}
        setShowVoteErrorToast={setShowVoteErrorToast}
        setVoteRecords={setVoteRecords}
        setDayAbilityForm={setDayAbilityForm}
        setDamselGuessUsedBy={setDamselGuessUsedBy}
        setHadesiaChoices={setHadesiaChoices}
        setWinResult={setWinResult}
        setWinReason={setWinReason}
        setSelectedActionTargets={setSelectedActionTargets}
        setTodayDemonVoted={setTodayDemonVoted}
        setSeats={setSeats}
        setGamePhase={setGamePhase}
        setShowShootModal={setShowShootModal}
        setShowNominateModal={setShowNominateModal}
        handleSeatClick={handleSeatClick}
        toggleStatus={toggleStatus}
        handleMenuAction={handleMenuAction}
        getRegistrationCached={getRegistrationCached}
        isGoodAlignment={isGoodAlignment}
        getSeatRoleId={getSeatRoleId}
        cleanseSeatStatuses={cleanseSeatStatuses}
        typeLabels={typeLabels}
        typeColors={typeColors}
        typeBgColors={typeBgColors}
        setDayAbilityLogs={setDayAbilityLogs}
        setDamselGuessed={setDamselGuessed}
        setShamanTriggered={setShamanTriggered}
        setHadesiaChoice={setHadesiaChoice}
        setShowAttackBlockedModal={setShowAttackBlockedModal}
      />
    </>
  );
}
