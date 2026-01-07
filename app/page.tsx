"use client";

import { useMemo, useEffect, useCallback, useRef } from "react";
import { roles, Role, Seat, StatusEffect, LogEntry, GamePhase, WinResult, groupedRoles, typeLabels, typeColors, typeBgColors, RoleType, scripts, Script } from "./data";
import { NightHintState, NightInfoResult, GameRecord, phaseNames } from "../src/types/game";
import { useGameController, type DayAbilityConfig } from "../src/hooks/useGameController";
import { useRoleAction } from "../src/hooks/useRoleAction";
import { isRoleRegistered } from "../src/roles/index";
import PortraitLock from "../src/components/PortraitLock";
import GameStageWrapper from "../src/components/GameStage";
import GameStage from "../src/components/game/GameStage";
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
import ScriptSelection from "@/src/components/game/setup/ScriptSelection";
import GameSetup from "@/src/components/game/setup/GameSetup";

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
  // demonActionDisabled and isTargetDisabled moved to GameStage component

  // handleSeatClick logic moved to useGameController as onSeatClick - using imported version
  const handleSeatClick = onSeatClick;

  // getStandardComposition is now imported from useGameController

  // validateBaronSetup and validateCompositionSetup are now imported from useGameController

  // proceedToCheckPhase is now imported from useGameController

  // closeNightOrderPreview moved to GameStage component

  // toggleTarget moved to GameStage component

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
  
  // isConfirmDisabled moved to GameStage component
  
  // confirmNightOrderPreview moved to GameStage component

  // confirmKill moved to useGameController - using imported version

  // confirmMayorRedirect, confirmHadesiaKill, confirmMoonchildKill, confirmSweetheartDrunk, 
  // confirmKlutzChoice, confirmStorytellerDeath, confirmHadesia, confirmSaintExecution, 
  // cancelSaintExecution moved to useGameController - using imported versions
  
  // setHadesiaChoice moved to useGameController - using imported version

  // executeNomination, handleVirginGuideConfirm, handleDayAction, handleDayAbilityTrigger 
  // moved to useGameController - using imported versions

  // reviveSeat is now imported from useGameController

  // submitVotes moved to useGameController - using imported version

  // executeJudgment moved to useGameController - using imported version
  
  // 6. 确认处决结果后继续游
  // confirmExecutionResult and enterDuskPhase moved to useGameController - using imported versions

  // declareMayorImmediateWin, handleDayEndTransition moved to useGameController - using imported versions

  // resolveLunaticRps and confirmShootResult moved to useGameController - using imported versions

  // openContextMenuForSeat, handleContextMenu, handleTouchStart, handleTouchEnd, handleTouchMove moved to GameStage component
  // canToggleRedHerring, handleCheckTouchStart, handleCheckTouchEnd, handleCheckTouchMove, handleCheckContextMenu moved to GameStage component
  // handleMenuAction moved to GameStage component

  // toggleStatus moved to useGameController - using imported version

  // confirmRavenkeeperFake, confirmVirginTrigger moved to useGameController - using imported versions

  // 注意此函数已不再使用守鸦人的结果现在直接显示在控制台
  // 保留此函数仅为了兼容性但不会被调用
  const confirmRavenkeeperResult = () => {
    // 此函数已废弃不再使用
    setShowRavenkeeperResultModal(null);
  };

  // handleRestart, confirmRestart, handleSwitchScript, handleNewGame 
  // moved to useGameController - using imported versions

  // executeAction from useRoleAction moved to GameStage component
  // seatScale, currentNightNumber, currentWakeSeat, nextWakeSeatId, nextWakeSeat, getDisplayRole, currentWakeRole, nextWakeRole moved to GameStage component
  
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
      {gamePhase === 'scriptSelection' && (
        <GameStageWrapper>
        <div className="w-full h-full flex flex-col bg-slate-950 text-white">
            <aside className="w-full h-full border-l border-white/10 bg-slate-900/50 flex flex-col relative z-20 shrink-0 overflow-hidden">
            <div className="px-4 py-2 border-b border-white/10 shrink-0 h-16 flex items-center">
              <h2 className="text-lg font-bold text-purple-300"> 说书人控制台</h2>
            </div>
              <div className="flex-1 overflow-y-auto p-4 text-sm min-h-0">
                <ScriptSelection
                  onScriptSelect={setSelectedScript}
                  saveHistory={saveHistory}
                  setGameLogs={setGameLogs}
                  setGamePhase={setGamePhase}
                />
              </div>
            </aside>
              </div>
        </GameStageWrapper>
      )}
      {gamePhase === 'setup' && (
        <GameStageWrapper>
          <div className="w-full h-full flex flex-col bg-slate-950 text-white">
            <aside className="w-full h-full border-l border-white/10 bg-slate-900/50 flex flex-col relative z-20 shrink-0 overflow-hidden">
              <div className="px-4 py-2 border-b border-white/10 shrink-0 h-16 flex items-center">
                <h2 className="text-lg font-bold text-purple-300"> 说书人控制台</h2>
                </div>
              <div className="flex-1 overflow-y-auto p-4 text-sm min-h-0">
                <GameSetup
                  seats={seats}
                  selectedScript={selectedScript}
                  selectedRole={selectedRole}
                  setSelectedRole={setSelectedRole}
                  handleSeatClick={handleSeatClick}
                  handlePreStartNight={handlePreStartNight}
                  proceedToCheckPhase={proceedToCheckPhase}
                  filteredGroupedRoles={filteredGroupedRoles}
                  validateCompositionSetup={validateCompositionSetup}
                  validateBaronSetup={validateBaronSetup}
                  compositionError={compositionError}
                  baronSetupCheck={baronSetupCheck}
                  ignoreBaronSetup={ignoreBaronSetup}
                  setIgnoreBaronSetup={setIgnoreBaronSetup}
                />
                </div>
            </aside>
                        </div>
        </GameStageWrapper>
      )}
      {gamePhase !== 'scriptSelection' && gamePhase !== 'setup' && (
        <GameStage controller={controller} />
                )}
              </div>

      {/* Modals - Only setup-related modals remain here */}
      {/* Game modals are now in GameStage component */}
    </>
  );
}
