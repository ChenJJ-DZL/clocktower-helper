"use client";

import { useState, useRef } from "react";
import { Seat, Role, GamePhase, WinResult, LogEntry, Script } from "../../app/data";
import { NightHintState, GameRecord } from "../types/game";
import { RegistrationResult } from "../utils/gameRules";
import { ModalType } from "../types/modal";

/**
 * 游戏状态管理 Hook
 * 包含所有游戏相关的状态定义（useState 和 useRef）
 */
export function useGameState() {
  // ===========================
  //      STATE 定义 (完整，前置)
  // ===========================
  const [mounted, setMounted] = useState(false);
  const [showIntroLoading, setShowIntroLoading] = useState(true); // Intro 加载动画（不属于具体剧本）
  const [isPortrait, setIsPortrait] = useState(false); // 是否为竖屏设备
  const [seats, setSeats] = useState<Seat[]>([]);
  const [initialSeats, setInitialSeats] = useState<Seat[]>([]);
  
  const [gamePhase, setGamePhase] = useState<GamePhase>("scriptSelection");
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  const [nightCount, setNightCount] = useState(1);
  const [deadThisNight, setDeadThisNight] = useState<number[]>([]); // 改为存储玩家ID
  const [executedPlayerId, setExecutedPlayerId] = useState<number | null>(null);
  const [gameLogs, setGameLogs] = useState<LogEntry[]>([]);
  const [winResult, setWinResult] = useState<WinResult>(null);
  const [winReason, setWinReason] = useState<string | null>(null);
  
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [timer, setTimer] = useState(0);
  
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; seatId: number } | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [longPressingSeats, setLongPressingSeats] = useState<Set<number>>(new Set()); // 正在长按的座位
  const checkLongPressTimerRef = useRef<NodeJS.Timeout | null>(null); // 核对身份列表长按定时器
  const longPressTriggeredRef = useRef<Set<number>>(new Set()); // 座位长按是否已触发（避免短按被阻断）
  const seatContainerRef = useRef<HTMLDivElement | null>(null); // 椭圆桌容器
  const seatRefs = useRef<Record<number, HTMLDivElement | null>>({}); // 每个座位元素引用
  
  const [wakeQueueIds, setWakeQueueIds] = useState<number[]>([]);
  const [currentWakeIndex, setCurrentWakeIndex] = useState(0);
  const [selectedActionTargets, setSelectedActionTargets] = useState<number[]>([]);
  const [inspectionResult, setInspectionResult] = useState<string | null>(null);
  const [inspectionResultKey, setInspectionResultKey] = useState(0); // 占卜师结果刷新用，强制重新渲染结果弹窗
  const [currentHint, setCurrentHint] = useState<NightHintState>({ isPoisoned: false, guide: "", speak: "" });
  // ——记录白天事件 & 一次性全局状态（梦陨春宵新增角色需要） ——
  const [todayDemonVoted, setTodayDemonVoted] = useState(false);
  const [todayMinionNominated, setTodayMinionNominated] = useState(false);
  const [todayExecutedId, setTodayExecutedId] = useState<number | null>(null);
  const [witchCursedId, setWitchCursedId] = useState<number | null>(null);
  const [witchActive, setWitchActive] = useState(false);
  const [cerenovusTarget, setCerenovusTarget] = useState<{ targetId: number; roleName: string } | null>(null);
  const [isVortoxWorld, setIsVortoxWorld] = useState(false);
  const [fangGuConverted, setFangGuConverted] = useState(false);
  const [jugglerGuesses, setJugglerGuesses] = useState<Record<number, { playerId: number; roleId: string }[]>>({});
  const [evilTwinPair, setEvilTwinPair] = useState<{ evilId: number; goodId: number } | null>(null);
  
  // 保存每个角色的 hint 信息，用于上一夜时恢复（不重新生成）
  const hintCacheRef = useRef<Map<string, NightHintState>>(new Map());
  // 记录酒鬼是否首次获得信息（首次一定是假的）
  const drunkFirstInfoRef = useRef<Map<number, boolean>>(new Map());

  // ===========================
  //  统一的弹窗状态管理
  // ===========================
  const [currentModal, setCurrentModal] = useState<ModalType>(null);
  
  // ===========================
  //  保留的辅助状态（非弹窗显示状态）
  // ===========================
  const [showShootModal, setShowShootModal] = useState<number | null>(null); // 用于触发开枪选择，不是弹窗本身
  const [showNominateModal, setShowNominateModal] = useState<number | null>(null); // 用于触发提名选择，不是弹窗本身
  const [dayAbilityForm, setDayAbilityForm] = useState<{
    info1?: string;
    info2?: string;
    guess?: string;
    feedback?: string;
    advice?: string;
    engineerMode?: 'demon' | 'minion';
    engineerRoleId?: string;
  }>({});
  const [baronSetupCheck, setBaronSetupCheck] = useState<{
    recommended: { townsfolk: number; outsider: number; minion: number; demon: number; total: number };
    current: { townsfolk: number; outsider: number; minion: number; demon: number };
    playerCount: number;
  } | null>(null);
  const [ignoreBaronSetup, setIgnoreBaronSetup] = useState(false);
  const [compositionError, setCompositionError] = useState<{
    standard: { townsfolk: number; outsider: number; minion: number; demon: number; total: number };
    actual: { townsfolk: number; outsider: number; minion: number; demon: number };
    playerCount: number;
    hasBaron: boolean;
  } | null>(null);
  const [showRavenkeeperResultModal, setShowRavenkeeperResultModal] = useState<{targetId: number, roleName: string, isFake: boolean} | null>(null);
  const [showAttackBlockedModal, setShowAttackBlockedModal] = useState<{targetId: number; reason: string; demonName?: string} | null>(null); // 攻击被阻挡弹窗
  const [showBarberSwapModal, setShowBarberSwapModal] = useState<{demonId: number; firstId: number | null; secondId: number | null} | null>(null); // 理发师交换角色弹窗
  const [showNightDeathReportModal, setShowNightDeathReportModal] = useState<string | null>(null); // 夜晚死亡报告弹窗
  const [voteInputValue, setVoteInputValue] = useState<string>('');
  const [showVoteErrorToast, setShowVoteErrorToast] = useState(false);
  const [gameRecords, setGameRecords] = useState<GameRecord[]>([]);
  const [mayorRedirectTarget, setMayorRedirectTarget] = useState<number | null>(null); // 市长转移的目标
  const [nightOrderPreview, setNightOrderPreview] = useState<{ roleName: string; seatNo: number; order: number }[]>([]);
  const [pendingNightQueue, setPendingNightQueue] = useState<Seat[] | null>(null);
  const [nightQueuePreviewTitle, setNightQueuePreviewTitle] = useState<string>(""); // 预览标题文案
  const [firstNightOrder, setFirstNightOrder] = useState<{seatId: number; role: Role}[]>([]);
  const [poppyGrowerDead, setPoppyGrowerDead] = useState(false); // 罂粟种植者是否已死亡
  const [klutzChoiceTarget, setKlutzChoiceTarget] = useState<number | null>(null);
  const [showKlutzChoiceModal, setShowKlutzChoiceModal] = useState<{sourceId: number; onResolve?: (latestSeats?: Seat[]) => void} | null>(null); // 呆瓜选择弹窗
  const [showSweetheartDrunkModal, setShowSweetheartDrunkModal] = useState<{sourceId: number; onResolve: (latestSeats?: Seat[]) => void} | null>(null); // 心上人醉酒弹窗
  const [showMoonchildKillModal, setShowMoonchildKillModal] = useState<{sourceId: number; onResolve: (latestSeats?: Seat[]) => void} | null>(null); // 月之子杀人弹窗
  const [lastExecutedPlayerId, setLastExecutedPlayerId] = useState<number | null>(null); // 最后被处决的玩家ID（用于食人族）
  const [damselGuessed, setDamselGuessed] = useState(false); // 落难少女是否已被猜测
  const [shamanKeyword, setShamanKeyword] = useState<string | null>(null); // 灵言师的关键词
  const [shamanTriggered, setShamanTriggered] = useState(false); // 灵言师关键词是否已触发
  const [shamanConvertTarget, setShamanConvertTarget] = useState<number | null>(null);
  const [spyDisguiseMode, setSpyDisguiseMode] = useState<'off' | 'default' | 'on'>('default'); // 间谍伪装干扰模式：关闭干扰、默认、开启干扰
  const [spyDisguiseProbability, setSpyDisguiseProbability] = useState(0.8); // 间谍伪装干扰概率（默认80%）
  const [pukkaPoisonQueue, setPukkaPoisonQueue] = useState<{ targetId: number; nightsUntilDeath: number }[]>([]); // 普卡中毒->死亡队列
  const [poChargeState, setPoChargeState] = useState<Record<number, boolean>>({}); // 珀：是否已蓄力（上夜未杀人）
  const [autoRedHerringInfo, setAutoRedHerringInfo] = useState<string | null>(null); // 自动分配天敌红罗剎结果提示
  const [dayAbilityLogs, setDayAbilityLogs] = useState<{ id: number; roleId: string; text: string; day: number }[]>([]);
  const [damselGuessUsedBy, setDamselGuessUsedBy] = useState<number[]>([]); // 已进行过落难少女猜测的爪牙ID

  // 通用一次性限次能力使用记录（按角色ID+座位ID存储）
  const [usedOnceAbilities, setUsedOnceAbilities] = useState<Record<string, number[]>>({});
  const [usedDailyAbilities, setUsedDailyAbilities] = useState<Record<string, { day: number; seats: number[] }>>({});
  const [nominationMap, setNominationMap] = useState<Record<number, number>>({});
  const [balloonistKnownTypes, setBalloonistKnownTypes] = useState<Record<number, string[]>>({});
  const [balloonistCompletedIds, setBalloonistCompletedIds] = useState<number[]>([]); // 已知完所有类型的气球驾驶员
  // 哈迪寂亚：记录三名目标的生死选择，默认"生"
  const [hadesiaChoices, setHadesiaChoices] = useState<Record<number, 'live' | 'die'>>({});
  const [virginGuideInfo, setVirginGuideInfo] = useState<{
    targetId: number;
    nominatorId: number;
    isFirstTime: boolean;
    nominatorIsTownsfolk: boolean;
  } | null>(null);
  const [voteRecords, setVoteRecords] = useState<Array<{ voterId: number; isDemon: boolean }>>([]); // 投票记录（用于卖花女孩）
  const [votedThisRound, setVotedThisRound] = useState<number[]>([]); // 本轮投票的玩家ID列表（用于卖花女/城镇公告员）
  const [hasExecutedThisDay, setHasExecutedThisDay] = useState<boolean>(false); // 今日是否有人被处决（用于 Vortox）
  const [remainingDays, setRemainingDays] = useState<number | null>(null); // 剩余日间数（evil_twin 相关）
  const [goonDrunkedThisNight, setGoonDrunkedThisNight] = useState<boolean>(false); // 莽夫（Goon）今晚是否醉酒

  // ===========================
  //  所有 Modal 显示状态
  // ===========================
  const [showKillConfirmModal, setShowKillConfirmModal] = useState<number | null>(null);
  const [showMayorRedirectModal, setShowMayorRedirectModal] = useState<{targetId: number; demonName: string} | null>(null);
  const [showPitHagModal, setShowPitHagModal] = useState<{targetId: number | null; roleId: string | null} | null>(null);
  const [showRangerModal, setShowRangerModal] = useState<{targetId: number; roleId: string | null} | null>(null);
  const [showDamselGuessModal, setShowDamselGuessModal] = useState<{minionId: number | null; targetId: number | null} | null>(null);
  const [showShamanConvertModal, setShowShamanConvertModal] = useState<boolean>(false);
  const [showHadesiaKillConfirmModal, setShowHadesiaKillConfirmModal] = useState<number[] | null>(null);
  const [showPoisonConfirmModal, setShowPoisonConfirmModal] = useState<number | null>(null);
  const [showPoisonEvilConfirmModal, setShowPoisonEvilConfirmModal] = useState<number | null>(null);
  const [showRestartConfirmModal, setShowRestartConfirmModal] = useState<boolean>(false);
  const [showSpyDisguiseModal, setShowSpyDisguiseModal] = useState<boolean>(false);
  const [showMayorThreeAliveModal, setShowMayorThreeAliveModal] = useState<boolean>(false);
  const [showDrunkModal, setShowDrunkModal] = useState<number | null>(null);
  const [showVoteInputModal, setShowVoteInputModal] = useState<number | null>(null);
  const [showRoleSelectModal, setShowRoleSelectModal] = useState<{type: 'philosopher' | 'cerenovus' | 'pit_hag'; targetId: number; onConfirm: (roleId: string) => void} | null>(null);
  const [showMadnessCheckModal, setShowMadnessCheckModal] = useState<{targetId: number; roleName: string; day: number} | null>(null);
  const [showDayActionModal, setShowDayActionModal] = useState<{type: 'slayer' | 'nominate' | 'lunaticKill'; sourceId: number} | null>(null);
  const [showDayAbilityModal, setShowDayAbilityModal] = useState<{roleId: string; seatId: number} | null>(null);
  const [showSaintExecutionConfirmModal, setShowSaintExecutionConfirmModal] = useState<{targetId: number} | null>(null);
  const [showLunaticRpsModal, setShowLunaticRpsModal] = useState<{targetId: number; nominatorId: number | null} | null>(null);
  const [showVirginTriggerModal, setShowVirginTriggerModal] = useState<{source: Seat; target: Seat} | null>(null);
  const [showRavenkeeperFakeModal, setShowRavenkeeperFakeModal] = useState<number | null>(null);
  const [showStorytellerDeathModal, setShowStorytellerDeathModal] = useState<{sourceId: number} | null>(null);
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [showGameRecordsModal, setShowGameRecordsModal] = useState<boolean>(false);
  const [showRoleInfoModal, setShowRoleInfoModal] = useState<boolean>(false);
  const [showExecutionResultModal, setShowExecutionResultModal] = useState<{message: string; isVirginTrigger?: boolean} | null>(null);
  const [showShootResultModal, setShowShootResultModal] = useState<{message: string; isDemonDead: boolean} | null>(null);
  const [showNightOrderModal, setShowNightOrderModal] = useState<boolean>(false);
  const [showFirstNightOrderModal, setShowFirstNightOrderModal] = useState<boolean>(false);
  const [showMinionKnowDemonModal, setShowMinionKnowDemonModal] = useState<{demonSeatId: number} | null>(null);

  const seatsRef = useRef(seats);
  const fakeInspectionResultRef = useRef<string | null>(null);
  const consoleContentRef = useRef<HTMLDivElement>(null);
  const currentActionTextRef = useRef<HTMLSpanElement>(null);
  const moonchildChainPendingRef = useRef(false);
  const longPressTimerRef = useRef<Map<number, NodeJS.Timeout>>(new Map()); // 存储每个座位的长按定时器
  const registrationCacheRef = useRef<Map<string, RegistrationResult>>(new Map()); // 同夜查验结果缓存
  const registrationCacheKeyRef = useRef<string>('');
  const introTimeoutRef = useRef<any>(null);
  
  // 历史记录用于"上一步"功能
  const [history, setHistory] = useState<Array<{
    seats: Seat[];
    gamePhase: GamePhase;
    nightCount: number;
    executedPlayerId: number | null;
    wakeQueueIds: number[];
    currentWakeIndex: number;
    selectedActionTargets: number[];
    gameLogs: LogEntry[];
    currentHint?: NightHintState; // 保存 hint 信息
    selectedScript: Script | null; // 保存选中的剧本
  }>>([]);
  
  // 提名记录：记录谁提名了谁
  const [nominationRecords, setNominationRecords] = useState<{
    nominators: Set<number>; // 已经提名过的玩家
    nominees: Set<number>; // 已经被提名过的玩家
  }>({ nominators: new Set(), nominees: new Set() });
  
  // 上一个黄昏的处决记录（用于送葬者）
  const [lastDuskExecution, setLastDuskExecution] = useState<number | null>(null);
  // 当前黄昏的处决记录（在进入新黄昏时，会更新lastDuskExecution）
  const [currentDuskExecution, setCurrentDuskExecution] = useState<number | null>(null);
  
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

