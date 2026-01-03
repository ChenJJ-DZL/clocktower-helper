"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { roles, Role, Seat, StatusEffect, LogEntry, GamePhase, WinResult, groupedRoles, typeLabels, typeColors, typeBgColors, RoleType, scripts, Script } from "./data";
import { NightHintState, NightInfoResult, GameRecord, phaseNames } from "../src/types/game";
import PortraitLock from "../src/components/PortraitLock";
import GameStage from "../src/components/GameStage";
import { ModalWrapper } from "../src/components/modals/ModalWrapper";
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

// 暗流涌动标准阵容（用于校验/自动重排）
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


// 获取玩家的注册阵营（用于查验类技能）
// 间谍：虽然是爪牙，但可以被注册为"Good"（善良）
// 隐士：虽然是外来者，但可以被注册为"Evil"（邪恶）
// viewingRole: 执行查验的角色，用于判断是否需要应用注册判定

// 判断玩家是否被注册为恶魔（用于占卜师等角色）
// 隐士可能被注册为恶魔，间谍不相关（占卜师检查的是恶魔，不是邪恶）
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

// 判断玩家是否被注册为爪牙（用于调查员等角色）
// 间谍虽然是爪牙，但可能被注册为"Good"（善良），此时不应被调查员看到
// viewingRole: 执行查验的角色，用于判断是否需要应用注册判定
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
    // 如果是间谍，需要检查注册判定
    if (targetPlayer.role.id === 'spy') {
      // 如果查看者不是查验类角色，或者间谍伪装模式关闭，返回真实类型（是爪牙）
      if (!viewingRole || spyDisguiseMode === 'off') {
        return true;
      }
      // 如果间谍被注册为善良，则不应被注册为爪牙
      const registeredAlignment = getRegisteredAlignment(
        targetPlayer,
        viewingRole,
        spyDisguiseMode,
        spyDisguiseProbability,
        options
      );
      // 如果被注册为善良，则不被注册为爪牙；如果被注册为邪恶，则被注册为爪牙
      return registeredAlignment === 'Evil';
    }
    // 其他爪牙总是被注册为爪牙
    return true;
  }
  
  // 隐士可能被注册为爪牙（如果被注册为邪恶，可能在某些查验中被视为爪牙）
  // 但根据规则，调查员检查的是"爪牙"，隐士通常不会被注册为爪牙类型
  // 这里保持原逻辑：隐士不会被注册为爪牙类型
  
  return false;
};


const getSeatRoleId = (seat?: Seat | null): string | null => {
  if (!seat) return null;
  const role = seat.role?.id === 'drunk' ? seat.charadeRole : seat.role;
  return role ? role.id : null;
};

// 清理临时状态：用于复活、变身、交换等场景
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


// 判断某个夜晚行动是否属于“有效果的行动类能力”（杀人/投毒/保护/标记等）
const isActionAbility = (role?: Role | null): boolean => {
  if (!role) return false;
  const t = role.nightActionType;
  return t === 'kill' || t === 'poison' || t === 'protect' || t === 'mark' || t === 'kill_or_skip';
};

// 统一判断角色是否在本回合应视为“能力失效”（中毒或醉酒）
const isActorDisabledByPoisonOrDrunk = (seat: Seat | undefined, knownIsPoisoned?: boolean): boolean => {
  if (!seat) return !!knownIsPoisoned;
  const poisoned = knownIsPoisoned !== undefined ? knownIsPoisoned : computeIsPoisoned(seat);
  const drunk = seat.isDrunk || seat.role?.id === 'drunk';
  return poisoned || drunk;
};


// 统一添加酒鬼标记（带清除时间）
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
      markText = `心上人致醉（${clearTime}清除）`;
      break;
    case 'goon':
      markText = `莽夫使其醉酒（${clearTime}清除）`;
      break;
    case 'sailor':
      markText = `水手致醉（${clearTime}清除）`;
      break;
    case 'innkeeper':
      markText = `旅店老板致醉（${clearTime}清除）`;
      break;
    case 'courtier':
      markText = `侍臣致醉（${clearTime}清除）`;
      break;
    case 'philosopher':
      markText = `哲学家致醉（${clearTime}清除）`;
      break;
    case 'minstrel':
      markText = `吟游诗人致醉（${clearTime}清除）`;
      break;
  }
  
  // 移除同类型的旧标记，添加新标记
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

// 判断玩家在胜负条件计算中是否属于邪恶阵营（仅计算爪牙和恶魔，隐士永远属于善良阵营）
const isEvilForWinCondition = (seat: Seat): boolean => {
  if (!seat.role) return false;
  if (seat.isGoodConverted) return false;
  return seat.isEvilConverted === true ||
         seat.role.type === 'demon' || 
         seat.role.type === 'minion' || 
         seat.isDemonSuccessor;
};

// 用于渲染的阵营颜色：优先考虑转换标记
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


// --- 核心计算逻辑 ---
// calculateNightInfo 已迁移到 src/utils/nightLogic.ts
import { calculateNightInfo } from "@/src/utils/nightLogic";
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

// ======================================================================
//  暗流涌动 / 暗流涌动剧本 / 游戏的第一部分
//  - 当前组件中，除「加载动画」(showIntroLoading / triggerIntroLoading 及对应 JSX)
//    之外的所有状态、逻辑与界面，均属于「暗流涌动」剧本（游戏的第一部分）的实现。
//  - 未来若新增其他剧本，可通过拆分/复用这里的结构作为参考。
// ======================================================================
export default function Home() {
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
  // ——— 记录白天事件 & 一次性/全局状态（梦陨春宵新增角色需要） ———
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
  
  // 保存每个角色的 hint 信息，用于"上一步"时恢复（不重新生成）
  const hintCacheRef = useRef<Map<string, NightHintState>>(new Map());
  // 记录酒鬼是否首次获得信息（首次一定是假的）
  const drunkFirstInfoRef = useRef<Map<number, boolean>>(new Map());

  const [showShootModal, setShowShootModal] = useState<number | null>(null);
  const [showNominateModal, setShowNominateModal] = useState<number | null>(null);
  const [showDayActionModal, setShowDayActionModal] = useState<{type: 'slayer'|'nominate'|'lunaticKill', sourceId: number} | null>(null);
  const [showDayAbilityModal, setShowDayAbilityModal] = useState<{
    roleId: string;
    seatId: number;
  } | null>(null);
  const [dayAbilityForm, setDayAbilityForm] = useState<{
    info1?: string;
    info2?: string;
    guess?: string;
    feedback?: string;
    advice?: string;
    engineerMode?: 'demon' | 'minion';
    engineerRoleId?: string;
  }>({});
  const [showDrunkModal, setShowDrunkModal] = useState<number | null>(null);
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
  const [showVirginTriggerModal, setShowVirginTriggerModal] = useState<{source: Seat, target: Seat} | null>(null);
  const [showRavenkeeperFakeModal, setShowRavenkeeperFakeModal] = useState<number | null>(null);
  const [showRavenkeeperResultModal, setShowRavenkeeperResultModal] = useState<{targetId: number, roleName: string, isFake: boolean} | null>(null);
  const [showVoteInputModal, setShowVoteInputModal] = useState<number | null>(null);
  const [voteInputValue, setVoteInputValue] = useState<string>('');
  const [showVoteErrorToast, setShowVoteErrorToast] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showGameRecordsModal, setShowGameRecordsModal] = useState(false);
  const [gameRecords, setGameRecords] = useState<GameRecord[]>([]);
  const [showRoleInfoModal, setShowRoleInfoModal] = useState(false);
  const [showExecutionResultModal, setShowExecutionResultModal] = useState<{message: string, isVirginTrigger?: boolean} | null>(null);
  const [showShootResultModal, setShowShootResultModal] = useState<{message: string, isDemonDead: boolean} | null>(null);
  const [showKillConfirmModal, setShowKillConfirmModal] = useState<number | null>(null); // 恶魔确认杀死玩家
  const [showAttackBlockedModal, setShowAttackBlockedModal] = useState<{
    targetId: number;
    reason: string;
    demonName?: string;
  } | null>(null); // 攻击无效提示（僧侣/士兵/茶艺师保护）
  const [showMayorRedirectModal, setShowMayorRedirectModal] = useState<{targetId: number; demonName: string} | null>(null); // 市长被攻击时的转移提示
  const [mayorRedirectTarget, setMayorRedirectTarget] = useState<number | null>(null); // 市长转移的目标
  const [showMayorThreeAliveModal, setShowMayorThreeAliveModal] = useState(false); // 3人生存且有市长时的处决前提醒
  const [showPoisonConfirmModal, setShowPoisonConfirmModal] = useState<number | null>(null); // 投毒者确认下毒
  const [showPoisonEvilConfirmModal, setShowPoisonEvilConfirmModal] = useState<number | null>(null); // 投毒者确认对邪恶玩家下毒
  const [showNightDeathReportModal, setShowNightDeathReportModal] = useState<string | null>(null); // 夜晚死亡报告
  const [showHadesiaKillConfirmModal, setShowHadesiaKillConfirmModal] = useState<number[] | null>(null); // 哈迪寂亚确认杀死3名玩家
  const [showMoonchildKillModal, setShowMoonchildKillModal] = useState<{ sourceId: number; onResolve: (latestSeats?: Seat[]) => void } | null>(null); // 月之子死亡连锁提示
  const [showStorytellerDeathModal, setShowStorytellerDeathModal] = useState<{ sourceId: number } | null>(null); // 麻脸巫婆造新恶魔后的说书人死亡选择
  const [showSweetheartDrunkModal, setShowSweetheartDrunkModal] = useState<{ sourceId: number; onResolve: (latestSeats?: Seat[]) => void } | null>(null); // 心上人死亡致醉
  const [showMinionKnowDemonModal, setShowMinionKnowDemonModal] = useState<{ demonSeatId: number } | null>(null); // 首晚爪牙认识恶魔环节
  const [goonDrunkedThisNight, setGoonDrunkedThisNight] = useState(false); // 本夜莽夫是否已让首个选择者醉酒
  const [showPitHagModal, setShowPitHagModal] = useState<{targetId: number | null; roleId: string | null} | null>(null); // 麻脸巫婆变更角色
  const [showBarberSwapModal, setShowBarberSwapModal] = useState<{demonId: number; firstId: number | null; secondId: number | null} | null>(null); // 理发师死亡后交换
  const [showRangerModal, setShowRangerModal] = useState<{targetId: number; roleId: string | null} | null>(null); // 巡山人变身落难少女
  const [showDamselGuessModal, setShowDamselGuessModal] = useState<{minionId: number | null; targetId: number | null} | null>(null); // 爪牙猜测落难少女
  const [showNightOrderModal, setShowNightOrderModal] = useState(false); // 首夜叫醒顺位预览
  const [nightOrderPreview, setNightOrderPreview] = useState<{ roleName: string; seatNo: number; order: number }[]>([]);
  const [pendingNightQueue, setPendingNightQueue] = useState<Seat[] | null>(null);
  const [nightQueuePreviewTitle, setNightQueuePreviewTitle] = useState<string>(""); // 预览标题文案
  const finalizeNightStart = useCallback((queue: Seat[], isFirst: boolean) => {
    setWakeQueueIds(queue.map(s => s.id)); 
    setCurrentWakeIndex(0); 
    setSelectedActionTargets([]);
    setInspectionResult(null);
    setGamePhase(isFirst ? "firstNight" : "night"); 
    if(!isFirst) setNightCount(n => n + 1);
    setShowNightOrderModal(false);
    setPendingNightQueue(null);
  }, []);
  const getDisplayRoleForSeat = useCallback((seat?: Seat | null) => {
    if (!seat) return null;
    return seat.role?.id === 'drunk' ? seat.charadeRole : seat.role;
  }, []);
  const [showFirstNightOrderModal, setShowFirstNightOrderModal] = useState(false); // 首夜顺位提示
  const [firstNightOrder, setFirstNightOrder] = useState<{seatId: number; role: Role}[]>([]);
  const [showRestartConfirmModal, setShowRestartConfirmModal] = useState<boolean>(false); // 重开确认弹窗
  const [poppyGrowerDead, setPoppyGrowerDead] = useState(false); // 罂粟种植者是否已死亡
  const [showKlutzChoiceModal, setShowKlutzChoiceModal] = useState<{ sourceId: number; onResolve?: (latestSeats?: Seat[]) => void } | null>(null); // 呆瓜死亡后选择
  const [klutzChoiceTarget, setKlutzChoiceTarget] = useState<number | null>(null);
  const [lastExecutedPlayerId, setLastExecutedPlayerId] = useState<number | null>(null); // 最后被处决的玩家ID（用于食人族）
  const [damselGuessed, setDamselGuessed] = useState(false); // 落难少女是否已被猜测
  const [shamanKeyword, setShamanKeyword] = useState<string | null>(null); // 灵言师的关键词
  const [shamanTriggered, setShamanTriggered] = useState(false); // 灵言师关键词是否已触发
  const [showShamanConvertModal, setShowShamanConvertModal] = useState(false); // 灵言师触发转阵营
  const [shamanConvertTarget, setShamanConvertTarget] = useState<number | null>(null);
  const [spyDisguiseMode, setSpyDisguiseMode] = useState<'off' | 'default' | 'on'>('default'); // 间谍伪装干扰模式：关闭干扰、默认、开启干扰
  const [spyDisguiseProbability, setSpyDisguiseProbability] = useState(0.8); // 间谍伪装干扰概率（默认80%）
  const [showSpyDisguiseModal, setShowSpyDisguiseModal] = useState(false); // 伪装身份识别浮窗
  const [pukkaPoisonQueue, setPukkaPoisonQueue] = useState<{ targetId: number; nightsUntilDeath: number }[]>([]); // 普卡中毒->死亡队列
  const [poChargeState, setPoChargeState] = useState<Record<number, boolean>>({}); // 珀：是否已蓄力（上夜未杀人）
  const [autoRedHerringInfo, setAutoRedHerringInfo] = useState<string | null>(null); // 自动分配红罗刹结果提示
  const [dayAbilityLogs, setDayAbilityLogs] = useState<{ id: number; roleId: string; text: string; day: number }[]>([]);
  const [damselGuessUsedBy, setDamselGuessUsedBy] = useState<number[]>([]); // 已进行过落难少女猜测的爪牙ID

  // 通用一次性/限次能力使用记录（按角色ID+座位ID存储）
  const [usedOnceAbilities, setUsedOnceAbilities] = useState<Record<string, number[]>>({});
  const [usedDailyAbilities, setUsedDailyAbilities] = useState<Record<string, { day: number; seats: number[] }>>({});
  const [nominationMap, setNominationMap] = useState<Record<number, number>>({});
  const [showLunaticRpsModal, setShowLunaticRpsModal] = useState<{ targetId: number; nominatorId: number | null } | null>(null);
  const [balloonistKnownTypes, setBalloonistKnownTypes] = useState<Record<number, string[]>>({});
  const [balloonistCompletedIds, setBalloonistCompletedIds] = useState<number[]>([]); // 已知完所有类型的气球驾驶员
  // 哈迪寂亚：记录三名目标的生/死选择，默认“生”
  const [hadesiaChoices, setHadesiaChoices] = useState<Record<number, 'live' | 'die'>>({});
  const [virginGuideInfo, setVirginGuideInfo] = useState<{
    targetId: number;
    nominatorId: number;
    isFirstTime: boolean;
    nominatorIsTownsfolk: boolean;
  } | null>(null);
  const [showRoleSelectModal, setShowRoleSelectModal] = useState<{
    type: 'philosopher' | 'cerenovus' | 'pit_hag';
    targetId: number;
    onConfirm: (roleId: string) => void;
  } | null>(null); // 角色选择弹窗（替换 prompt）
  const [voteRecords, setVoteRecords] = useState<Array<{ voterId: number; isDemon: boolean }>>([]); // 投票记录（用于卖花女孩）
  const [remainingDays, setRemainingDays] = useState<number | null>(null); // 剩余日间数（evil_twin 相关）
  const [showMadnessCheckModal, setShowMadnessCheckModal] = useState<{
    targetId: number;
    roleName: string;
    day: number;
  } | null>(null); // 疯狂判定弹窗
  const [showSaintExecutionConfirmModal, setShowSaintExecutionConfirmModal] = useState<{
    targetId: number;
    skipLunaticRps?: boolean;
  } | null>(null); // 圣徒处决强警告弹窗

  const seatsRef = useRef(seats);
  const fakeInspectionResultRef = useRef<string | null>(null);
  const consoleContentRef = useRef<HTMLDivElement>(null);
  const currentActionTextRef = useRef<HTMLSpanElement>(null);
  const moonchildChainPendingRef = useRef(false);
  const longPressTimerRef = useRef<Map<number, NodeJS.Timeout>>(new Map()); // 存储每个座位的长按定时器
  const registrationCacheRef = useRef<Map<string, RegistrationResult>>(new Map()); // 同夜查验结果缓存
  const registrationCacheKeyRef = useRef<string>('');

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
    // 记录一次性能力已用，并在座位状态中打标
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
      // 最多保存100条记录
      if (records.length > 100) {
        records = records.slice(0, 100);
      }
      localStorage.setItem('clocktower_game_records', JSON.stringify(records));
      setGameRecords(records);
    } catch (error) {
      console.error('保存对局记录失败:', error);
    }
  }, []);

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
        console.error('初始化失败:', error);
        // 即使出错也要设置 mounted，避免白屏
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

  // 间谍/隐士查验结果在同一夜晚保持一致：伪装参数变化时刷新缓存
  useEffect(() => {
    if (gamePhase === 'firstNight' || gamePhase === 'night') {
      resetRegistrationCache(`${gamePhase}-${nightCount}-disguise`);
    }
  }, [spyDisguiseMode, spyDisguiseProbability, resetRegistrationCache]);

  // 进入新的夜晚阶段时，重置同夜查验结果缓存，保证当晚内一致、跨夜独立
  useEffect(() => {
    if (gamePhase === 'firstNight' || gamePhase === 'night') {
      resetRegistrationCache(`${gamePhase}-${nightCount}`);
    }
  }, [gamePhase, nightCount, resetRegistrationCache]);

  // 检测设备方向和屏幕尺寸
  useEffect(() => {
    if (!mounted) return;
    
    const checkOrientation = () => {
      // 检测是否为竖屏：高度大于宽度，或者使用媒体查询
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

  // 自动识别当前是否处于涡流恶魔环境（镇民信息应为假）
  useEffect(() => {
    const aliveVortox = seats.some(
      s => !s.isDead && ((s.role?.id === 'vortox') || (s.isDemonSuccessor && s.role?.id === 'vortox'))
    );
    setIsVortoxWorld(aliveVortox);
  }, [seats]);

  // 预留的一次性/配对状态，后续在梦陨春宵角色逻辑中使用
  useEffect(() => {
    // 目前仅用于保持状态引用，防止未使用警告
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

  // 气球驾驶员：当已知完所有类型时写说明日志（只写一次）
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
        addLog(`气球驾驶员 ${id + 1}号 已在前几夜得知所有角色类型（镇民、外来者、爪牙、恶魔），从今夜起将不再被唤醒，这符合规则。`);
      });
      setBalloonistCompletedIds(prev => [...prev, ...newlyCompleted]);
    }
  }, [balloonistKnownTypes, balloonistCompletedIds, addLog]);

  // 添加日志并去重：每个玩家每晚只保留最后一次行动
  const addLogWithDeduplication = useCallback((msg: string, playerId?: number, roleName?: string) => {
    setGameLogs(prev => {
      // 如果提供了玩家ID和角色名，先删除该玩家在该阶段之前的日志
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
      
      // 清除临时中毒状态（普克造成的除外）
      const filteredStatusDetails = (s.statusDetails || []).filter(st => {
        // 保留永久中毒标记
        if (st.includes('永久中毒') || st.includes('永久')) return true;
        // 保留普卡中毒（普卡的中毒会在夜晚时自动处理死亡）
        if (st.includes('普卡中毒')) return true;
        // 清除所有带"至下个黄昏"、"下个黄昏清除"、"次日黄昏清除"的临时中毒标记
        if (st.includes('至下个黄昏') || st.includes('下个黄昏清除') || st.includes('次日黄昏清除')) {
          // 检查是否是普卡中毒
          if (st.includes('普卡中毒')) return true;
          return false; // 清除其他临时中毒
        }
        // 保留其他标记（如"下一夜死亡时"、"下一个善良玩家被处决时"等特殊清除条件）
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
  }, [selectedScript, seats, currentWakeIndex, gamePhase, wakeQueueIds, lastDuskExecution, isEvilWithJudgment, poppyGrowerDead, spyDisguiseMode, spyDisguiseProbability, deadThisNight, balloonistKnownTypes, addLog, nightCount, isVortoxWorld]);

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

  useEffect(() => {
    if (nightInfo) {
      // 生成缓存 key：用于"上一步"时恢复 hint，不重新生成
      const hintKey = `${gamePhase}-${currentWakeIndex}-${nightInfo.seat.id}`;
      
      // 检查缓存中是否有该角色的 hint（用于"上一步"时恢复）
      const cachedHint = hintCacheRef.current.get(hintKey);
      if (cachedHint) {
        setCurrentHint(cachedHint);
        if (cachedHint.fakeInspectionResult) {
          fakeInspectionResultRef.current = cachedHint.fakeInspectionResult;
        }
        return; // 使用缓存的 hint，不重新计算
      }
      
      // 没有缓存，重新计算 hint
      let fakeResult = currentHint.fakeInspectionResult;
      // 占卜师的假信息现在在玩家选择后根据真实结果生成（在 toggleTarget 函数中）
      // 这里不再预先生成假信息，因为需要先知道玩家选择了谁才能计算真实结果
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
      
      // 气球驾驶员：自动记录日志（被动信息技能）
      if (nightInfo.effectiveRole.id === 'balloonist' && nightInfo.guide.includes('你得知') && !nightInfo.isPoisoned) {
        // 从 guide 中提取信息：格式为 "🎈 你得知 X号，角色类型：镇民"
        const match = nightInfo.guide.match(/你得知 (\d+)号，角色类型[：:](.+)/);
        if (match) {
          const seatNum = match[1];
          const typeName = match[2].trim();
          addLogWithDeduplication(
            `${nightInfo.seat.id+1}号(气球驾驶员) 得知 ${seatNum}号，角色类型：${typeName}`,
            nightInfo.seat.id,
            '气球驾驶员'
          );
          // 记录已知类型，防止重复
          setBalloonistKnownTypes(prev => {
            const known = prev[nightInfo.seat.id] || [];
            if (known.includes(typeName)) return prev;
            return { ...prev, [nightInfo.seat.id]: [...known, typeName] };
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
  }, [currentWakeIndex, gamePhase, nightInfo, seats, selectedActionTargets, currentHint.fakeInspectionResult, gameLogs, addLogWithDeduplication]);

  // 夜晚阶段切换角色时，自动滚动控制台到顶部
  useEffect(() => {
    if ((gamePhase === 'firstNight' || gamePhase === 'night') && consoleContentRef.current) {
      consoleContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentWakeIndex, gamePhase]);

  // 动态调整"当前是X号X角色在行动"的字体大小，确保不超出容器
  const adjustActionTextSize = useCallback(() => {
    if (currentActionTextRef.current && nightInfo) {
      const textElement = currentActionTextRef.current;
      const container = textElement.parentElement;
      if (!container) return;

      // 重置字体大小
      textElement.style.fontSize = '';
      
      // 获取容器宽度和文本宽度
      const containerWidth = container.offsetWidth;
      const textWidth = textElement.scrollWidth;
      
      // 如果文本超出容器，则缩小字体
      if (textWidth > containerWidth) {
        const baseFontSize = 30; // text-3xl 对应的大约30px
        const scale = containerWidth / textWidth;
        const newFontSize = Math.max(baseFontSize * scale * 0.95, 12); // 最小12px，留5%边距
        textElement.style.fontSize = `${newFontSize}px`;
      }
    }
  }, [nightInfo]);

  useEffect(() => {
    adjustActionTextSize();
    // 窗口大小改变时重新计算
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
    
    // 当游戏重新开始时，重置保存标记
    if (gamePhase === 'scriptSelection' || gamePhase === 'setup') {
      gameRecordSavedRef.current = false;
    }
  }, [gamePhase, winResult, selectedScript, startTime, timer, winReason, seats, gameLogs, saveGameRecord]);

  // 检查游戏结束条件
  const checkGameOver = useCallback((updatedSeats: Seat[], executedPlayerIdArg?: number | null, preserveWinReason?: boolean) => {
    // 防御性检查：确保updatedSeats不为空且是有效数组
    if (!updatedSeats || updatedSeats.length === 0) {
      console.error('checkGameOver: updatedSeats为空或无效');
      return false;
    }
    
    // 计算存活人数（仅统计已分配角色的玩家）；僵怖假死状态（isFirstDeathForZombuul=true但isZombuulTrulyDead=false）算作存活
    const aliveSeats = updatedSeats.filter(s => {
      // 确保seat对象有效并且已经分配角色，未分配的空座位不计入存活人数
      if (!s || !s.role) return false;
      // 僵怖特殊处理：假死状态算作存活
      if (s.role?.id === 'zombuul' && s.isFirstDeathForZombuul && !s.isZombuulTrulyDead) {
        return true;
      }
      return !s.isDead;
    });
    const aliveCount = aliveSeats.length;
    
    // 优先检查：当场上仅存2位存活玩家时，游戏结束，宣布邪恶阵营获胜
    // 这个检查应该优先于其他检查，因为这是立即胜利条件
    if (aliveCount <= 2) {
      setWinResult('evil');
      setWinReason(`场上仅存${aliveCount}位存活玩家`);
      setGamePhase('gameOver');
      addLog(`游戏结束：场上仅存${aliveCount}位存活玩家，邪恶阵营获胜`);
      return true;
    }
    
    // 检查：当场上所有存活玩家都是邪恶阵营时，立即宣布邪恶阵营获胜
    // 注意：在胜负条件计算中，仅计算爪牙和恶魔，隐士永远属于善良阵营
    // 僵怖假死状态应该被算作存活
    if (aliveSeats.length > 0) {
      const allEvil = aliveSeats.every(s => isEvilForWinCondition(s));
      if (allEvil) {
        setWinResult('evil');
        setWinReason('场上所有存活玩家都是邪恶阵营');
        setGamePhase('gameOver');
        addLog(`游戏结束：场上所有存活玩家都是邪恶阵营，邪恶阵营获胜`);
        return true;
      }
    }

    const executionTargetId = executedPlayerIdArg ?? executedPlayerId;
    
    // 优先检查：镜像双子（evil_twin）- 如果善良双子被处决，邪恶阵营获胜
    if (executionTargetId !== null && executionTargetId !== undefined && evilTwinPair) {
      const executedPlayer = updatedSeats.find(s => s.id === executionTargetId);
      if (executedPlayer && executedPlayer.id === evilTwinPair.goodId) {
        setWinResult('evil');
        setWinReason('镜像双子：善良双子被处决');
        setGamePhase('gameOver');
        addLog("游戏结束：镜像双子善良双子被处决，邪恶阵营获胜");
        return true;
      }
    }
    
    // 优先检查：圣徒被处决导致邪恶方获胜（优先级高于恶魔死亡判定）
    // 这个检查必须在恶魔死亡检查之前，确保圣徒被处决的判定优先级更高
    if (executionTargetId !== null && executionTargetId !== undefined) {
      const executedPlayer = updatedSeats.find(s => s.id === executionTargetId);
      // “刚刚死于处决的圣徒”立即触发邪恶获胜，优先级最高
      const justExecutedSaint =
        executedPlayer &&
        executedPlayer.role?.id === 'saint' &&
        !executedPlayer.isPoisoned &&
        executedPlayer.isDead;
      if (justExecutedSaint) {
        setWinResult('evil');
        setWinReason('圣徒被处决');
        setGamePhase('gameOver');
        addLog("游戏结束：圣徒被处决，邪恶胜利");
        return true;
      }
    }
    
    // 检查是否有活着的恶魔（包括原小恶魔和"小恶魔（传）"）
    // 注意：僵怖假死状态（isFirstDeathForZombuul=true但isZombuulTrulyDead=false）不算真正死亡
    const aliveDemon = updatedSeats.find(s => {
      if (s.role?.type !== 'demon' && !s.isDemonSuccessor) return false;
      // 僵怖特殊处理：只有真正死亡（isZombuulTrulyDead=true）才算死亡
      if (s.role?.id === 'zombuul') {
        return !s.isZombuulTrulyDead;
      }
      return !s.isDead;
    });
    
    // 检查是否有死亡的恶魔（包括原小恶魔和"小恶魔（传）"）
    // 注意：僵怖假死状态不算真正死亡
    const deadDemon = updatedSeats.find(s => {
      if (s.role?.type !== 'demon' && !s.isDemonSuccessor) return false;
      // 僵怖特殊处理：只有真正死亡（isZombuulTrulyDead=true）才算死亡
      if (s.role?.id === 'zombuul') {
        return s.isZombuulTrulyDead === true;
      }
      return s.isDead;
    });
    
    // 检查镜像双子（evil_twin）- 如果两个双子都存活，善良阵营无法获胜
    if (evilTwinPair) {
      const evilTwin = updatedSeats.find(s => s.id === evilTwinPair.evilId);
      const goodTwin = updatedSeats.find(s => s.id === evilTwinPair.goodId);
      const bothAlive = evilTwin && !evilTwin.isDead && goodTwin && !goodTwin.isDead;
      if (bothAlive && deadDemon && !aliveDemon) {
        // 恶魔死亡但双子都存活，善良无法获胜，游戏继续
        addLog("镜像双子：两个双子都存活，善良阵营无法获胜，游戏继续");
        return false;
      }
    }
    
    // 如果原小恶魔死亡，但存在活着的"小恶魔（传）"，游戏继续
    // 只有当所有恶魔（包括"小恶魔（传）"）都死亡时，好人才胜利
    if (deadDemon && !aliveDemon) {
      setWinResult('good');
      // 判断是原小恶魔还是"小恶魔（传）"死亡
      // 如果 preserveWinReason 为 true，则不覆盖 winReason（比如猎手击杀的情况）
      if (!preserveWinReason) {
        if (deadDemon.isDemonSuccessor) {
          setWinReason('小恶魔（传）死亡');
          addLog("游戏结束：小恶魔（传）死亡，好人胜利");
        } else {
          setWinReason('小恶魔死亡');
          addLog("游戏结束：小恶魔死亡，好人胜利");
        }
      }
      setGamePhase('gameOver');
      return true;
    }
    
    // 如果没有活着的恶魔，检查是否有红唇女郎可以继任
    // 注意：红唇女郎的变身逻辑主要在 executePlayer 中处理
    // 这里只是检查，如果存活玩家数量 < 5 或没有红唇女郎，判定好人胜利
    if (!aliveDemon) {
      const scarletWoman = updatedSeats.find(s => 
        s.role?.id === 'scarlet_woman' && !s.isDead && !s.isDemonSuccessor
      );
      // 如果存活玩家数量 < 5 或没有红唇女郎，判定好人胜利
      if (aliveCount < 5 || !scarletWoman) {
        setWinResult('good');
        setWinReason('恶魔死亡');
        setGamePhase('gameOver');
        addLog("游戏结束：恶魔死亡，好人胜利");
        return true;
      }
      // 如果存活玩家数量 >= 5 且有红唇女郎，游戏继续（红唇女郎的变身在 executePlayer 中处理）
    }
    
    const mayorAlive = aliveSeats.some(s => s.role?.id === 'mayor');
    if (aliveCount === 3 && mayorAlive && gamePhase === 'day') {
      setWinResult('good');
      setWinReason('3人存活且无人被处决（市长能力）');
      setGamePhase('gameOver');
      addLog("因为场上只剩 3 名存活玩家且今天无人被处决，【市长】触发能力，好人立即获胜。");
      return true;
    }
    
    return false;
  }, [addLog, gamePhase, evilTwinPair, executedPlayerId]);
  
  // ======================================================================
  //  游戏流程 / 剧本流程 / 通用流程
  //  - 以下与 gamePhase 相关的状态、函数和处理逻辑，
  //    定义了当前剧本（暗流涌动）的整套通用流程：
  //    「准备阶段 (setup) → 核对身份 (check) → 首夜 (firstNight)
  //      → 白天 (day) → 黄昏/处决 (dusk) → 夜晚 (night)
  //      → 天亮结算 (dawnReport) → 游戏结束 (gameOver)」。
  //  - 未来如果开发新的剧本，可以整体复制 / 修改这一段流程代码，
  //    作为新剧本的“游戏流程 / 剧本流程 / 通用流程”模板。
  // ======================================================================
  // --- Handlers ---
  // 恶魔无技能夜晚（如首夜仅展示信息、跳过回合）时，禁止选择任何目标
  const demonActionDisabled = useMemo(() => {
    if (!nightInfo) return false;
    if (nightInfo.effectiveRole.type !== 'demon') return false;
    const act = nightInfo.action || '';
    // 首夜且行为不是直接杀人时，视为无技能
    if (gamePhase === 'firstNight' && !act.includes('杀')) return true;
    // 明确的跳过/无信息/仅展示
    if (['跳过', '无信息', '展示'].some(k => act.includes(k))) return true;
    return false;
  }, [nightInfo, gamePhase]);

  const isTargetDisabled = (s: Seat) => {
    if (!nightInfo) return true;
    if (demonActionDisabled) return true;
    const rid = nightInfo.effectiveRole.id;
    if (rid === 'monk' && s.id === nightInfo.seat.id) return true;
    if (rid === 'poisoner' && s.isDead) return true;
    if (rid === 'ravenkeeper' && !deadThisNight.includes(nightInfo.seat.id)) return true;
    // 镜像双子：只能选择善良玩家
    if (rid === 'evil_twin' && gamePhase === 'firstNight') {
      if (!s.role) return true;
      if (s.role.type !== 'townsfolk' && s.role.type !== 'outsider') return true;
    }
    // 7. 修复小恶魔选择问题 - 首夜不能选人，非首夜可以选择
    if (rid === 'imp' && gamePhase === 'firstNight') return true;
    // 小恶魔可以选择自己（用于身份转移）
    // 管家不能选择自己作为主人
    if (rid === 'butler' && s.id === nightInfo.seat.id) return true;
    // 教授：只能选择死亡玩家，且用过能力后禁用
    if (rid === 'professor_mr') {
      if (hasUsedAbility('professor_mr', nightInfo.seat.id)) return true;
      const targetRole = s.role?.id === 'drunk' ? s.charadeRole : s.role;
      if (!s.isDead) return true;
      return !targetRole || targetRole.type !== 'townsfolk';
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
        setSeats(p=>p.map(s=>s.id===id?{...s,role:selectedRole}:s)); 
        setSelectedRole(null);
      } else {
        setSeats(p=>p.map(s=>s.id===id?{...s,role:null}:s));
      }
    }
  };

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

  const validateBaronSetup = useCallback((activeSeats: Seat[]) => {
    if (ignoreBaronSetup) return true;
    const hasBaronInSeats = activeSeats.some(s => s.role?.id === "baron");
    if (selectedScript?.id !== 'trouble_brewing' || !hasBaronInSeats) return true;

    const recommended = getStandardComposition(activeSeats.length, true);
    const actualCounts = {
      townsfolk: activeSeats.filter(s => s.role?.type === 'townsfolk').length,
      outsider: activeSeats.filter(s => s.role?.type === 'outsider').length,
      minion: activeSeats.filter(s => s.role?.type === 'minion').length,
      demon: activeSeats.filter(s => s.role?.type === 'demon').length,
    };

    if (actualCounts.townsfolk !== recommended.townsfolk || actualCounts.outsider !== recommended.outsider) {
      setBaronSetupCheck({
        recommended,
        current: actualCounts,
        playerCount: activeSeats.length,
      });
      return false;
    }

    return true;
  }, [getStandardComposition, selectedScript, ignoreBaronSetup]);

  // 完整的阵容校验函数（用于校验《暗流涌动》的标准配置）
  const validateCompositionSetup = useCallback((activeSeats: Seat[]) => {
    // 只对《暗流涌动》剧本进行校验
    if (selectedScript?.id !== 'trouble_brewing') return true;

    const playerCount = activeSeats.length;
    
    // 校验7-15人局（覆盖所有可能出现的情况）
    if (playerCount < 7 || playerCount > 15) return true;

    const hasBaron = activeSeats.some(s => s.role?.id === "baron");
    const standard = getStandardComposition(playerCount, hasBaron);
    
    const actual = {
      townsfolk: activeSeats.filter(s => s.role?.type === 'townsfolk').length,
      outsider: activeSeats.filter(s => s.role?.type === 'outsider').length,
      minion: activeSeats.filter(s => s.role?.type === 'minion').length,
      demon: activeSeats.filter(s => s.role?.type === 'demon').length,
    };

    // 检查是否与标准配置一致
    if (
      actual.townsfolk !== standard.townsfolk ||
      actual.outsider !== standard.outsider ||
      actual.minion !== standard.minion ||
      actual.demon !== standard.demon
    ) {
      setCompositionError({
        standard,
        actual,
        playerCount,
        hasBaron,
      });
      return false;
    }

    // 校验通过，清除错误
    setCompositionError(null);
    return true;
  }, [getStandardComposition, selectedScript]);

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
          addLog(`红罗刹分配：${t.id+1}号（${redRoleName}）`);
          setAutoRedHerringInfo(`${t.id + 1}号（${redRoleName}）`);
        }
      }
      
      // 检查是否有送葬者，如果有则添加说明日志
      const hasUndertaker = withRed.some(s => s.role?.id === "undertaker");
      if (hasUndertaker) {
        addLog(`【送葬者】只在非首夜的夜晚被唤醒，且只会看到"今天黄昏被处决并死亡的玩家"。`);
      }
      
      setSeats(withRed); 
      setInitialSeats(JSON.parse(JSON.stringify(withRed))); 
      setGamePhase("check");
    }, 100);
  }, [addLog]);

  const handlePreStartNight = () => {
      const active = seats.filter(s => s.role);
    if (active.length === 0) {
      alert("请先安排座位");
      return;
    }
    // 若酒鬼在场且未分配镇民伪装，强制弹窗选择后再继续
    const pendingDrunk = active.find(s => s.role?.id === "drunk" && (!s.charadeRole || s.charadeRole.type !== 'townsfolk'));
    if (pendingDrunk) {
      setAutoRedHerringInfo(null);
      setShowDrunkModal(pendingDrunk.id);
      return;
    }
    // 完整的阵容校验（必须在validateBaronSetup之前，因为它是更通用的校验）
    if (!validateCompositionSetup(active)) return;
    if (!validateBaronSetup(active)) return;
    const compact = active.map((s, i) => ({ ...s, id: i }));
      
    // 自动为酒鬼分配一个未被使用的镇民角色作为伪装（仅在已分配或无酒鬼时继续）
    let updatedCompact = [...compact];
    const drunk = updatedCompact.find(s => s.role?.id === "drunk" && !s.charadeRole);
    if(drunk) {
      // 获取所有已被使用的镇民角色ID
      const usedTownsfokIds = new Set(updatedCompact.map(s => s.role?.id).filter(Boolean));
      
      // 从当前剧本的镇民角色中筛选出未被使用的
      const availableTownsfok = (filteredGroupedRoles['townsfolk'] || groupedRoles['townsfolk'] || [])
        .filter(r => !usedTownsfokIds.has(r.id));
      
      if(availableTownsfok.length > 0) {
        // 随机选择一个未被使用的镇民角色作为酒鬼的伪装
        const charadeRole = getRandom(availableTownsfok);
        updatedCompact = updatedCompact.map(s => 
          s.id === drunk.id 
            ? { ...s, charadeRole, isDrunk: true } 
            : s
        );
      } else {
        // 如果没有未被使用的镇民角色，从所有镇民角色中随机选择一个（即使已被使用）
        const allTownsfok = filteredGroupedRoles['townsfolk'] || groupedRoles['townsfolk'] || [];
        if(allTownsfok.length > 0) {
          const charadeRole = getRandom(allTownsfok);
          updatedCompact = updatedCompact.map(s => 
            s.id === drunk.id 
              ? { ...s, charadeRole, isDrunk: true } 
              : s
          );
        }
      }
    }
    // 如果存在男爵，自动进行+2 外来者 / -2 镇民的重平衡
    const autoRebalanceForBaron = (seatsToAdjust: Seat[]): Seat[] => {
      const hasBaron = seatsToAdjust.some(s => s.role?.id === 'baron');
      if (!hasBaron) return seatsToAdjust;

      const outsiders = seatsToAdjust.filter(s => s.role?.type === 'outsider');
      const townsfolks = seatsToAdjust.filter(s => s.role?.type === 'townsfolk');
      if (townsfolks.length < 2) return seatsToAdjust; // 保护性检查

      const usedIds = new Set<string>(seatsToAdjust.map(s => s.role?.id).filter(Boolean) as string[]);
      const outsiderPool = (filteredGroupedRoles['outsider'] || groupedRoles['outsider'] || roles.filter(r => r.type === 'outsider'))
        .filter(r => !usedIds.has(r.id));

      const pickRole = (): Role | null => {
        if (outsiderPool.length === 0) return null;
        const [next, ...rest] = outsiderPool;
        outsiderPool.splice(0, 1);
        return next;
      };

      let nextSeats = [...seatsToAdjust];
      const targets = townsfolks.slice(0, 2); // 需要替换的两个镇民
      targets.forEach(target => {
        const newRole = pickRole();
        if (!newRole) return;
        nextSeats = nextSeats.map(s =>
          s.id === target.id
            ? {
                ...s,
                role: newRole,
                charadeRole: null,
                isDrunk: newRole.id === 'drunk',
                isPoisoned: false,
                isRedHerring: false,
                isFortuneTellerRedHerring: false,
                statusDetails: [],
                statuses: [],
              }
            : s
        );
      });

      addLog('检测到【男爵】，已自动将 2 名镇民改为外来者以满足配置。');
      return nextSeats;
    };

    updatedCompact = autoRebalanceForBaron(updatedCompact);
    
    proceedToCheckPhase(updatedCompact);
  };

  const handleBaronAutoRebalance = useCallback(() => {
    if (!baronSetupCheck) return;
    const recommended = baronSetupCheck.recommended;
    const outsiderPool = filteredGroupedRoles['outsider'] || groupedRoles['outsider'] || roles.filter(r => r.type === 'outsider');
    const townsfolkPool = filteredGroupedRoles['townsfolk'] || groupedRoles['townsfolk'] || roles.filter(r => r.type === 'townsfolk');

    setSeats(prev => {
      let updated = [...prev];
      const active = updated.filter(s => s.role);
      if (active.length === 0) return prev;

      const usedIds = new Set<string>(active.map(s => s.role?.id).filter(Boolean) as string[]);
      const pickRole = (pool: Role[]) => {
        if (pool.length === 0) return null;
        const candidate = pool.find(r => !usedIds.has(r.id)) || pool[0];
        if (candidate) usedIds.add(candidate.id);
        return candidate;
      };

      const outsiderSeats = active.filter(s => s.role?.type === 'outsider');
      const townsfolkSeats = active.filter(s => s.role?.type === 'townsfolk');

      if (outsiderSeats.length < recommended.outsider) {
        const need = recommended.outsider - outsiderSeats.length;
        const candidates = townsfolkSeats.slice(0, need);
        candidates.forEach(seat => {
          const newRole = pickRole(outsiderPool);
          if (!newRole) return;
          updated = updated.map(s => s.id === seat.id ? cleanseSeatStatuses({
            ...s,
            role: newRole,
            charadeRole: null,
            isDrunk: newRole.id === 'drunk',
            isPoisoned: false,
            isRedHerring: false,
            isFortuneTellerRedHerring: false,
            statusDetails: [],
          }, { keepDeathState: true }) : s);
        });
      } else if (outsiderSeats.length > recommended.outsider) {
        const need = outsiderSeats.length - recommended.outsider;
        const candidates = outsiderSeats.slice(0, need);
        candidates.forEach(seat => {
          const newRole = pickRole(townsfolkPool);
          if (!newRole) return;
          updated = updated.map(s => s.id === seat.id ? cleanseSeatStatuses({
            ...s,
            role: newRole,
            charadeRole: null,
            isDrunk: false,
            isPoisoned: false,
            isRedHerring: false,
            isFortuneTellerRedHerring: false,
            statusDetails: [],
          }, { keepDeathState: true }) : s);
        });
      }

      return updated;
    });

    setBaronSetupCheck(null);
    setTimeout(() => handlePreStartNight(), 120);
  }, [baronSetupCheck, filteredGroupedRoles, groupedRoles, roles, handlePreStartNight]);

  const confirmDrunkCharade = (r: Role) => {
    if (showDrunkModal === null) return;
    const updated = seats.map(s => s.id === showDrunkModal ? { ...s, charadeRole: r, isDrunk: true } : s);
    setShowDrunkModal(null);
    addLog(`酒鬼伪装：${showDrunkModal + 1}号展示【${r.name}】卡，实际是酒鬼。请对其说“你是${r.name}”。`);

    const active = updated.filter(s => s.role);
    if (!validateBaronSetup(active)) {
      setSeats(updated);
      return;
    }

    proceedToCheckPhase(active);
  };

  const confirmNightOrderPreview = useCallback(() => {
    if (!pendingNightQueue) {
      setShowNightOrderModal(false);
      return;
    }
    finalizeNightStart(pendingNightQueue, true);
  }, [pendingNightQueue, finalizeNightStart]);

  const closeNightOrderPreview = useCallback(() => {
    setPendingNightQueue(null);
    setNightOrderPreview([]);
    setShowNightOrderModal(false);
    setNightQueuePreviewTitle("");
  }, []);

  const startNight = (isFirst: boolean) => {
    // 保存历史记录
    saveHistory();
    // 白天事件与标记重置
    setTodayDemonVoted(false);
    setTodayMinionNominated(false);
    setTodayExecutedId(null);
    setWitchCursedId(null);
    setWitchActive(false);
    setCerenovusTarget(null);
    setVoteRecords([]); // 重置投票记录
    resetRegistrationCache(`${isFirst ? 'firstNight' : 'night'}-${isFirst ? 1 : nightCount + 1}`);
    setNominationMap({});
    const nightlyDeaths: number[] = [];
    setGoonDrunkedThisNight(false);
    setNightQueuePreviewTitle(isFirst ? `第1夜叫醒顺位` : "");
    
    // 对于非首夜，在进入夜晚前，将当前黄昏的处决记录保存为"上一个黄昏的处决记录"
    // 这样送葬者在夜晚时就能看到上一个黄昏的处决信息
    if (!isFirst) {
      if (currentDuskExecution !== null) {
        setLastDuskExecution(currentDuskExecution);
        // 清空当前黄昏的处决记录，准备记录新的处决
        setCurrentDuskExecution(null);
      }
      // 如果当前黄昏没有处决，保持上一个黄昏的记录（如果有的话）
      // 如果上一个黄昏也没有处决，lastDuskExecution保持为null
    }
    
    if(isFirst) setStartTime(new Date());
    
    // 普卡特殊处理：按队列推进中毒->死亡流程
    const pukkaDeaths: number[] = [];
    const nextPukkaQueue = pukkaPoisonQueue
      .map(entry => {
        const targetSeat = seats.find(s => s.id === entry.targetId);
        // 如果目标已经死亡（被处决或其他效果），移出队列
        if (targetSeat?.isDead) return null;
        const nightsLeft = entry.nightsUntilDeath - 1;
        if (nightsLeft <= 0) {
          pukkaDeaths.push(entry.targetId);
          return null;
        }
        return { ...entry, nightsUntilDeath: nightsLeft };
      })
      .filter((v): v is { targetId: number; nightsUntilDeath: number } => !!v);
    if (pukkaDeaths.length > 0) {
      pukkaDeaths.forEach((id, idx) => {
        nightlyDeaths.push(id);
        const isLast = idx === pukkaDeaths.length - 1;
        killPlayer(id, {
          seatTransformer: seat => {
            const filteredStatuses = (seat.statusDetails || []).filter(st => st !== '普卡中毒');
            const nextSeat = { ...seat, statusDetails: filteredStatuses };
            return { ...nextSeat, isPoisoned: computeIsPoisoned(nextSeat) };
          },
          skipGameOverCheck: !isLast, // 最后一次再检查游戏结束，避免重复检查
        });
        addLog(`${id+1}号 因普卡的中毒效果死亡并恢复健康`);
      });
    }
    // 更新普卡队列（存活者继续保持中毒状态）
    setPukkaPoisonQueue(nextPukkaQueue);
    
    setSeats(p => p.map(s => {
      // 清除所有带清除时间的标记（根据清除时间判断）
      const filteredStatusDetails = (s.statusDetails || []).filter(st => {
        // 保留永久标记
        if (st.includes('永久中毒') || st.includes('永久')) return true;
        // 清除所有带"次日黄昏清除"、"下个黄昏清除"、"至下个黄昏"的标记
        if (st.includes('次日黄昏清除') || st.includes('下个黄昏清除') || st.includes('至下个黄昏')) return false;
        // 保留其他标记（如"下一夜死亡时"、"下一个善良玩家被处决时"等特殊清除条件）
        return true;
      });
      
      const filteredStatuses = (s.statuses || []).filter(status => {
        if (status.effect === 'ExecutionProof') return true;
        // 清除所有带"Night+Day"、"1 Day"等标准清除时间的状态
        if (status.duration === '1 Day' || status.duration === 'Night+Day') return false;
        // 保留其他状态
        return true;
      });
      
      // 清除水手/旅店老板造成的醉酒状态（这些状态持续到"下个黄昏"，进入夜晚时清除）
      const filteredStatusDetailsForDrunk = filteredStatusDetails.filter(st => {
        // 清除水手/旅店老板造成的醉酒标记（这些标记包含"至下个黄昏清除"）
        if (st.includes('水手致醉') || st.includes('旅店老板致醉')) {
          // 检查是否包含"至下个黄昏"清除时间
          if (st.includes('至下个黄昏') || st.includes('下个黄昏清除')) {
            return false; // 清除这些标记
          }
        }
        return true; // 保留其他标记
      });
      
      // 检查是否应该保留酒鬼状态（永久酒鬼角色或没有临时酒鬼标记）
      const hasTemporaryDrunk = filteredStatusDetailsForDrunk.some(d => 
        d.includes('心上人致醉') || d.includes('莽夫使其醉酒') || 
        d.includes('水手致醉') || d.includes('旅店老板致醉') || 
        d.includes('侍臣致醉') || d.includes('哲学家致醉') || 
        d.includes('吟游诗人致醉')
      );
      const keepDrunk = s.role?.id === 'drunk' || (s.isDrunk && !hasTemporaryDrunk);
      
      const poisonedAfterClean = computeIsPoisoned({
        ...s,
        statusDetails: filteredStatusDetailsForDrunk,
        statuses: filteredStatuses,
      });
      
      return {
        ...s, 
        statuses: filteredStatuses,
        statusDetails: filteredStatusDetailsForDrunk,
        isPoisoned: poisonedAfterClean,
        isDrunk: keepDrunk,
        isProtected: false,
        protectedBy: null,
        voteCount: undefined, 
        isCandidate: false
      };
    }));
    setDeadThisNight(nightlyDeaths);
    fakeInspectionResultRef.current = null;
    
    // 对于非首夜，检查上一个黄昏是否有处决
    // 如果上一个黄昏没有处决，送葬者不应该被唤醒
    let previousDuskExecution = lastDuskExecution;
    if (isFirst) {
      // 首夜没有上一个黄昏，清除处决记录
      previousDuskExecution = null;
    } else {
      // 非首夜：检查是否有送葬者且上一个黄昏没有处决
      const hasUndertaker = seats.some(s => s.role?.id === 'undertaker' && !s.isDead);
      if (hasUndertaker && previousDuskExecution === null) {
        addLog(`本黄昏无人被处决，因此今晚【送葬者】不会被唤醒，这是正常规则。`);
      }
    }
    // 注意：lastDuskExecution 在进入夜晚时应该保持为上一个黄昏的处决记录
    // 在进入新的黄昏时会被更新
    
    // 夜半狂欢：首夜时，如果罂粟种植者在场，爪牙和恶魔不知道彼此
    // 如果罂粟种植者不在场或已死亡，爪牙和恶魔知道彼此
    const poppyGrower = seats.find(s => s.role?.id === 'poppy_grower');
    if (isFirst) {
      // 首夜时：如果罂粟种植者在场且存活，设置 poppyGrowerDead 为 false；否则为 true
      if (poppyGrower && !poppyGrower.isDead) {
        setPoppyGrowerDead(false); // 罂粟种植者在场且存活，爪牙和恶魔不知道彼此
      } else {
        setPoppyGrowerDead(true); // 罂粟种植者不在场或已死亡，爪牙和恶魔知道彼此
      }
    }
    
    // 夜半狂欢：首夜时，落难少女告知所有爪牙
    if (isFirst) {
      const damsel = seats.find(s => s.role?.id === 'damsel');
      if (damsel) {
        const minions = seats.filter(s => s.role?.type === 'minion' && !s.isDead);
        if (minions.length > 0) {
          const minionNames = minions.map(s => `${s.id+1}号`).join('、');
          addLog(`落难少女在场，所有爪牙(${minionNames})都知道这个信息`);
        }
      }
      
      // 夜半狂欢：首夜时，灵言师得知关键词
      const shaman = seats.find(s => s.role?.id === 'shaman');
      if (shaman) {
        const keywords = ['月亮', '星星', '太阳', '海洋', '山峰', '森林', '河流', '火焰', '风暴', '彩虹'];
        const keyword = getRandom(keywords);
        setShamanKeyword(keyword);
        addLog(`灵言师(${shaman.id+1}号)的关键词是【${keyword}】`);
      }
    }
    
    const q = seats
      .filter(s => s.role)
      .filter(s => 
        !s.isDead || 
        s.hasAbilityEvenDead || 
        s.isFirstDeathForZombuul || 
        (getSeatRoleId(s) === 'ravenkeeper' && nightlyDeaths.includes(s.id))
      )
      .sort((a,b) => {
        const ra = a.role?.id === 'drunk' ? a.charadeRole : a.role;
        const rb = b.role?.id === 'drunk' ? b.charadeRole : b.role;
        return (isFirst ? (ra?.firstNightOrder??0) : (ra?.otherNightOrder??0)) - (isFirst ? (rb?.firstNightOrder??0) : (rb?.otherNightOrder??0));
      });
    
    // 首夜：爪牙认恶魔应当是"集中唤醒所有爪牙"的一个环节
    // 实现方式：只保留队列中首位爪牙，其提示文案中引导说书人一次性叫醒所有爪牙
    let mergedQueue = q;
    if (isFirst) {
      const minionSeats = mergedQueue.filter(s => {
        const r = s.role?.id === 'drunk' ? s.charadeRole : s.role;
        return r?.type === 'minion' && (r.firstNightOrder ?? 0) > 0;
      });
      if (minionSeats.length > 1) {
        const keeperId = minionSeats[0].id;
        mergedQueue = mergedQueue.filter(s => {
          const r = s.role?.id === 'drunk' ? s.charadeRole : s.role;
          if (r?.type !== 'minion') return true;
          return s.id === keeperId;
        });
      }
    }

    const validQueue = mergedQueue.filter(s => {
      const r = s.role?.id === 'drunk' ? s.charadeRole : s.role;
      const roleId = r?.id;
      const diedTonight = nightlyDeaths.includes(s.id);
      // 6. 跳过在夜晚死亡的玩家（小恶魔杀害的玩家），但守鸦人死亡的当晚需要被唤醒，亡骨魔杀死的爪牙（保留能力）也需要被唤醒
      // 僵怖假死状态（isFirstDeathForZombuul=true）也需要被唤醒
      if (roleId === 'ravenkeeper' && !diedTonight) {
        return false;
      }
      if (s.isDead && !diedTonight && !s.hasAbilityEvenDead && !s.isFirstDeathForZombuul) {
        return false;
      }
      // 送葬者：如果上一个黄昏没有处决，不应该被唤醒
      // 注意：日志已在startNight函数中添加（在构建队列之前），这里不需要重复添加
      if (r?.id === 'undertaker' && !isFirst && previousDuskExecution === null) {
        return false;
      }
      // 僵怖：如果上一个黄昏有处决，不应该被唤醒（只有在白天没有人死亡时才被唤醒）
      if (r?.id === 'zombuul' && !isFirst && previousDuskExecution !== null) {
        return false;
      }
      // 气球驾驶员：四种类型都已知后不再唤醒
      if (r?.id === 'balloonist') {
        const known = balloonistKnownTypes[s.id] || [];
        const allTypesKnown = ['镇民','外来者','爪牙','恶魔'].every(t => known.includes(t));
        if (allTypesKnown) return false;
        // 首夜也需要按规则给出信息，避免被错误跳过
        if (isFirst) return true;
      }
      return isFirst ? (r?.firstNightOrder ?? 0) > 0 : (r?.otherNightOrder ?? 0) > 0;
    });
    
    // 若本夜没有任何需要被叫醒的角色，直接进入夜晚结算，避免卡在"正在计算行动..."
    if (validQueue.length === 0) {
      setWakeQueueIds([]);
      setCurrentWakeIndex(0);
      // 无任何叫醒目标时，直接进入夜晚结算弹窗
      if (nightlyDeaths.length > 0) {
        const deadNames = nightlyDeaths.map(id => `${id + 1}号`).join('、');
        setShowNightDeathReportModal(`昨晚${deadNames}玩家死亡`);
      } else {
        setShowNightDeathReportModal("昨天是个平安夜");
      }
      // 直接进入夜晚报道阶段
      setGamePhase('dawnReport');
      return;
    }

    if (isFirst) {
      setPendingNightQueue(validQueue);
      setNightOrderPreview(
        validQueue
          .map(s => {
            const r = s.role?.id === 'drunk' ? s.charadeRole : s.role;
            return { roleName: r?.name || '未知角色', seatNo: s.id + 1, order: r?.firstNightOrder ?? 999 };
          })
          .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      );
      setShowNightOrderModal(true);
      return;
    }

    finalizeNightStart(validQueue, isFirst);
  };

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
    
    // 如果当前叫醒的角色本身已中毒/醉酒，且其能力属于“行动类能力”，
    // 则当晚的实际效果应为“无事发生”：可以选择目标，但不会产生任何规则效果。
    const actorSeat = seats.find(s => s.id === nightInfo.seat.id);
    const actorDisabled = isActorDisabledByPoisonOrDrunk(actorSeat, nightInfo.isPoisoned);
    const isActionalAbility = isActionAbility(nightInfo.effectiveRole);
    if (actorDisabled && isActionalAbility) {
      if (newT.length > 0) {
        const tid = newT[newT.length - 1];
        addLogWithDeduplication(
          `${nightInfo.seat.id+1}号(${nightInfo.effectiveRole.name}) 处于中毒/醉酒状态，本夜对 ${tid+1}号 的行动无效（无事发生）`,
          nightInfo.seat.id,
          nightInfo.effectiveRole.name
        );
      }
      return;
    }
    
    // 投毒者选择目标后立即显示确认弹窗
    if(nightInfo.effectiveRole.id === 'poisoner' && nightInfo.effectiveRole.nightActionType === 'poison' && newT.length > 0) {
      const targetId = newT[newT.length - 1];
      const target = seats.find(s => s.id === targetId);
      const isEvilPlayer = target && (['minion','demon'].includes(target.role?.type||'') || target.isDemonSuccessor);
      if(isEvilPlayer) {
        setShowPoisonEvilConfirmModal(targetId);
      } else {
        setShowPoisonConfirmModal(targetId);
      }
      // 只更新高亮，不执行下毒，等待确认；保持其他中毒来源
      setSeats(p => p.map(s => {
        return {...s, isPoisoned: computeIsPoisoned(s)};
      }));
      return;
    }
    
    // 小恶魔选择目标后立即显示确认弹窗
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
        // 普卡特殊处理：只设置中毒，不立即死亡，并更新上一个中毒目标
        if (nightInfo.effectiveRole.id === 'pukka') {
          // 将目标放入普卡队列：当前夜晚中毒，下一夜死亡
          setPukkaPoisonQueue(prev => {
            const filtered = prev.filter(entry => entry.targetId !== tid);
            return [...filtered, { targetId: tid, nightsUntilDeath: 1 }];
          });
          // 注意：保留永久中毒标记（舞蛇人制造）和亡骨魔中毒标记，同时保留既有的普卡中毒标记
          setSeats(p => p.map(s => {
            if (s.id === tid) {
              // 普卡：当前夜晚中毒，下一夜死亡并恢复健康，所以清除时间是"下一夜死亡时"
              const clearTime = '下一夜死亡时';
              const { statusDetails, statuses } = addPoisonMark(s, 'pukka', clearTime);
              const nextSeat = { ...s, statusDetails, statuses };
              return { ...nextSeat, isPoisoned: computeIsPoisoned(nextSeat) };
            }
            return { ...s, isPoisoned: computeIsPoisoned(s) };
          }));
          if (nightInfo) {
            // 7. 行动日志去重：移除该玩家之前的操作记录，只保留最新的
            setGameLogs(prev => {
              const filtered = prev.filter(log => 
                !(log.message.includes(`${nightInfo.seat.id+1}号(普卡)`) && log.phase === gamePhase)
              );
              return [
                ...filtered, 
                { 
                  day: nightCount, 
                  phase: gamePhase, 
                  message: `${nightInfo.seat.id+1}号(普卡) 今晚令 ${tid+1}号 中毒，他会在下一个夜晚开始前死亡并恢复健康`
                }
              ];
            });
          }
        } else {
          // 其他投毒者（投毒者、夜半狂欢投毒者）的正常处理
          // 注意：保留永久中毒标记（舞蛇人制造）和亡骨魔中毒标记
          setSeats(p => p.map(s => {
            if (s.id === tid) {
              // 投毒者：当晚和明天白天中毒，在次日黄昏清除
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
            // 7. 行动日志去重：移除该玩家之前的操作记录，只保留最新的
            setGameLogs(prev => {
              const filtered = prev.filter(log => 
                !(log.message.includes(`${nightInfo.seat.id+1}号(投毒者)`) && log.phase === gamePhase)
              );
              return [...filtered, { day: nightCount, phase: gamePhase, message: `${nightInfo.seat.id+1}号(投毒者) 对 ${tid+1}号 下毒` }];
            });
          }
        }
      }
      if(action === 'protect') {
        if (nightInfo) {
          // 使用nightInfo.isPoisoned和seats状态双重检查，确保判断准确
          const monkSeat = seats.find(s => s.id === nightInfo.seat.id);
          const isMonkPoisoned = nightInfo.isPoisoned || 
                                 (monkSeat ? (monkSeat.isPoisoned || monkSeat.isDrunk || monkSeat.role?.id === "drunk") : false);
          
          // 如果僧侣中毒/醉酒，绝对不能设置保护效果，但可以正常选择玩家
          if (isMonkPoisoned) {
            // 强制清除所有保护状态，确保不会有任何保护效果
            setSeats(p => p.map(s => {
              // 如果这个玩家是被当前僧侣保护的，清除保护
              if (s.protectedBy === nightInfo.seat.id) {
                return {...s, isProtected: false, protectedBy: null};
              }
              return s;
            }));
            // 记录日志：选择但无保护效果
            setGameLogs(prev => {
              const filtered = prev.filter(log => 
                !(log.message.includes(`${nightInfo.seat.id+1}号(僧侣)`) && log.phase === gamePhase)
              );
              return [...filtered, { day: nightCount, phase: gamePhase, message: `${nightInfo.seat.id+1}号(僧侣) 选择保护 ${tid+1}号，但中毒/醉酒状态下无保护效果` }];
            });
          } else {
            // 健康状态下正常保护：先清除所有保护，然后只设置目标玩家的保护
            setSeats(p => {
              const updated = p.map(s => ({...s, isProtected: false, protectedBy: null}));
              return updated.map(s => s.id === tid ? {...s, isProtected: true, protectedBy: nightInfo.seat.id} : s);
            });
            setGameLogs(prev => {
              const filtered = prev.filter(log => 
                !(log.message.includes(`${nightInfo.seat.id+1}号(僧侣)`) && log.phase === gamePhase)
              );
              return [...filtered, { day: nightCount, phase: gamePhase, message: `${nightInfo.seat.id+1}号(僧侣) 保护 ${tid+1}号` }];
            });
          }
        }
      }
      // 莽夫：每夜首个以自身能力选择莽夫的玩家会醉酒至下个黄昏，莽夫阵营暂随选择者（以状态提示）
      if (!goonDrunkedThisNight) {
        const targetSeat = seats.find(s => s.id === tid);
        const chooserSeat = seats.find(s => s.id === nightInfo.seat.id);
        const isActional = ['kill', 'poison', 'protect', 'mark', 'kill_or_skip'].includes(nightInfo.effectiveRole.nightActionType || '');
        const validChooser = chooserSeat && !chooserSeat.isDead;
        if (targetSeat?.role?.id === 'goon' && !targetSeat.isDead && isActional && validChooser) {
          setGoonDrunkedThisNight(true);
          const chooserId = nightInfo.seat.id;
          setSeats(p => p.map(s => {
            if (s.id === chooserId) {
              // 莽夫：首个选择者醉酒至下个黄昏
              const clearTime = '下个黄昏';
              const { statusDetails, statuses } = addDrunkMark(s, 'goon', clearTime);
              return { ...s, isDrunk: true, statusDetails, statuses };
            }
            if (s.id === targetSeat.id) {
              const detail = '莽夫阵营暂随选择者';
              const statusDetails = Array.from(new Set([...(s.statusDetails || []), detail]));
              return { ...s, statusDetails };
            }
            return s;
          }));
          addLog(`${chooserId+1}号 以能力选择了 ${targetSeat.id+1}号(莽夫)，${chooserId+1}号 醉酒至下个黄昏，莽夫阵营暂随选择者`);
        }
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'devils_advocate' && newT.length === 1) {
        const targetId = newT[0];
        setSeats(p => p.map(s => {
          const filtered = (s.statuses || []).filter(status => status.effect !== 'ExecutionProof');
          if (s.id === targetId) {
            const nextStatuses: StatusEffect[] = [...filtered, { effect: 'ExecutionProof', duration: '1 Day', sourceId: nightInfo.seat.id }];
            return { ...s, statuses: nextStatuses };
          }
          return { ...s, statuses: filtered };
        }));
        setGameLogs(prev => {
          const filtered = prev.filter(log => 
            !(log.message.includes(`${nightInfo.seat.id+1}号(魔鬼代言人)`) && log.phase === gamePhase)
          );
          return [...filtered, { day: nightCount, phase: gamePhase, message: `${nightInfo.seat.id+1}号(魔鬼代言人) 选择保护 ${targetId+1}号 免于今日处决` }];
        });
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'butler') {
        setSeats(p => p.map(s => ({...s, masterId: tid})));
        if (nightInfo) {
          // 7. 行动日志去重
          setGameLogs(prev => {
            const filtered = prev.filter(log => 
              !(log.message.includes(`${nightInfo.seat.id+1}号(管家)`) && log.phase === gamePhase)
            );
            return [...filtered, { day: nightCount, phase: gamePhase, message: `${nightInfo.seat.id+1}号(管家) 选择 ${tid+1}号 为主人` }];
          });
        }
      }
      // 小恶魔需要确认，不立即执行死亡
      if(action === 'kill' && nightInfo.effectiveRole.id === 'imp' && gamePhase !== 'firstNight') {
        // 只更新选择，不执行杀死，等待确认
      }
      // ========== 夜半狂欢角色处理 ==========
      if(action === 'mark' && nightInfo.effectiveRole.id === 'snake_charmer_mr' && newT.length === 1) {
        // 舞蛇人：选择一名玩家，如果选中了恶魔，交换角色和阵营
        const targetSeat = seats.find(s => s.id === newT[0]);
        if (targetSeat && targetSeat.role && (targetSeat.role.type === 'demon' || targetSeat.isDemonSuccessor)) {
          // 选中了恶魔，交换角色和阵营
          const snakeCharmerSeat = nightInfo.seat;
          const demonRole = targetSeat.role;
          const snakeCharmerRole = snakeCharmerSeat.role;
          
          setSeats(p => p.map(s => {
            if (s.id === snakeCharmerSeat.id) {
              return { ...s, role: demonRole, isDemonSuccessor: targetSeat.isDemonSuccessor, isEvilConverted: true, isGoodConverted: false };
            } else if (s.id === targetSeat.id) {
              // 旧恶魔（新舞蛇人）：永久中毒，使用 statusDetails 标记
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
            message: `${snakeCharmerSeat.id+1}号(舞蛇人) 选择 ${targetSeat.id+1}号，交换角色和阵营，${targetSeat.id+1}号中毒（舞蛇人转邪，恶魔转善）` 
          }]);
        } else {
          // 没有选中恶魔，只记录选择
          setGameLogs(prev => {
            const filtered = prev.filter(log => 
              !(log.message.includes(`${nightInfo.seat.id+1}号(舞蛇人)`) && log.phase === gamePhase)
            );
            return [...filtered, { day: nightCount, phase: gamePhase, message: `${nightInfo.seat.id+1}号(舞蛇人) 选择 ${newT[0]+1}号` }];
          });
        }
      }
      // ========== 梦陨春宵角色处理 ==========
      if(action === 'mark' && nightInfo.effectiveRole.id === 'philosopher' && newT.length === 1) {
        // 哲学家：每局游戏限一次，选择一个善良角色，获得该角色的能力，原角色醉酒
        if (hasUsedAbility('philosopher', nightInfo.seat.id)) {
          addLog(`${nightInfo.seat.id+1}号(哲学家) 已用完一次性能力`);
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
              if (s.id === nightInfo.seat.id) {
                return { ...s, role: targetRole };
              }
              if (s.role?.id === targetRole.id) {
                // 哲学家：原角色从当晚开始醉酒三天三夜
                const clearTime = '三天三夜后';
                const { statusDetails, statuses } = addDrunkMark(s, 'philosopher', clearTime);
                return { ...s, isDrunk: true, statusDetails, statuses };
              }
              return s;
            }));
            addLog(`${nightInfo.seat.id+1}号(哲学家) 获得 ${targetRole.name} 的能力`);
            markAbilityUsed('philosopher', nightInfo.seat.id);
            setShowRoleSelectModal(null);
            continueToNextAction();
          }
        });
        return;
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'witch' && newT.length === 1) {
        // 女巫：每晚选择一名玩家，如果他明天白天发起提名，他死亡
        const targetId = newT[0];
        const aliveCount = seats.filter(s => !s.isDead).length;
        if (aliveCount <= 3) {
          addLog(`${nightInfo.seat.id+1}号(女巫) 只有三名或更少存活的玩家，失去此能力`);
          return;
        }
        setWitchCursedId(targetId);
        setWitchActive(true);
        addLogWithDeduplication(
          `${nightInfo.seat.id+1}号(女巫) 诅咒 ${targetId+1}号，若其明天发起提名则死亡`,
          nightInfo.seat.id,
          '女巫'
        );
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'evil_twin' && newT.length === 1) {
        // 镜像双子：首夜选择一名善良玩家作为对手
        const targetId = newT[0];
        const targetSeat = seats.find(s => s.id === targetId);
        if (!targetSeat) return;
        // 验证目标必须是善良玩家
        const isGood = targetSeat.role && (targetSeat.role.type === 'townsfolk' || targetSeat.role.type === 'outsider');
        if (!isGood) {
          alert('镜像双子必须选择一名善良玩家作为对手');
          return;
        }
        setEvilTwinPair({ evilId: nightInfo.seat.id, goodId: targetId });
        addLog(`${nightInfo.seat.id+1}号(镜像双子) 选择 ${targetId+1}号 作为对手`);
        continueToNextAction();
        return;
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'cerenovus' && newT.length === 1) {
        // 洗脑师：每晚选择一名玩家和一个善良角色
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
            addLogWithDeduplication(`${nightInfo.seat.id+1}号(洗脑师) 要求 ${targetId+1}号 疯狂扮演 ${targetRole.name}`, nightInfo.seat.id, '洗脑师');
            setShowRoleSelectModal(null);
          }
        });
        return;
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'pit_hag' && newT.length === 1) {
        // 麻脸巫婆：每晚选择一名玩家和一个角色，如果该角色不在场，他变成该角色
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
              addLog(`${nightInfo.seat.id+1}号(麻脸巫婆) 选择 ${targetId+1}号 变为 ${targetRole.name} 失败：场上已有该角色`);
              setShowRoleSelectModal(null);
              continueToNextAction();
              return;
            }
            setSeats(prev => prev.map(s => {
              if (s.id === targetId) {
                const cleaned = cleanseSeatStatuses({ ...s, isDemonSuccessor: false }, { keepDeathState: true });
                const nextSeat = { ...cleaned, role: targetRole, charadeRole: null };
                if (s.hasAbilityEvenDead) {
                  addLog(`${s.id+1}号因亡骨魔获得的“死而有能”效果在变身为 ${targetRole.name} 时已失效。`);
                }
                return nextSeat;
              }
              return s;
            }));
            addLog(`${nightInfo.seat.id+1}号(麻脸巫婆) 将 ${targetId+1}号 变为 ${targetRole.name}`);
            setShowRoleSelectModal(null);
            if (targetRole.type === 'demon') {
              setShowStorytellerDeathModal({ sourceId: targetId });
            }
            // 新角色当夜按顺位加入唤醒队列，可在本夜发动能力
            insertIntoWakeQueueAfterCurrent(targetId, { roleOverride: targetRole, logLabel: `${targetId+1}号(${targetRole.name})` });
            continueToNextAction();
          }
        });
        return;
      }
      // 气球驾驶员已改为被动信息技能，不再需要主动选择处理
      if(action === 'kill' && nightInfo.effectiveRole.id === 'vigormortis_mr' && gamePhase !== 'firstNight' && newT.length === 1) {
        // 夜半狂欢恶魔：选择1名玩家后立即显示确认弹窗
        setShowKillConfirmModal(newT[0]);
        return;
      }
      if(action === 'kill' && nightInfo.effectiveRole.id === 'hadesia' && gamePhase !== 'firstNight' && newT.length === 3) {
        // 哈迪寂亚：选择3名玩家后弹窗确认，允许说书人决定谁会死亡
        const initChoices: Record<number, 'live' | 'die'> = {};
        newT.forEach(id => { initChoices[id] = 'live'; });
        setHadesiaChoices(initChoices);
        setShowHadesiaKillConfirmModal(newT);
        return;
      }
      if(action === 'poison' && nightInfo.effectiveRole.id === 'poisoner_mr' && newT.length > 0) {
        // 夜半狂欢投毒者：选择目标后立即显示确认弹窗
        const targetId = newT[newT.length - 1];
        const target = seats.find(s => s.id === targetId);
        const isEvilPlayer = target && (['minion','demon'].includes(target.role?.type||'') || target.isDemonSuccessor);
        if(isEvilPlayer) {
          setShowPoisonEvilConfirmModal(targetId);
        } else {
          setShowPoisonConfirmModal(targetId);
        }
        // 注意：保留永久中毒标记（舞蛇人制造）和亡骨魔中毒标记
        setSeats(p => p.map(s => {
          return {...s, isPoisoned: computeIsPoisoned(s)};
        }));
        return;
      }
      // 梦陨春宵恶魔：选择目标后立即显示确认弹窗
      if(action === 'kill' && ['fang_gu', 'no_dashii', 'vortox'].includes(nightInfo.effectiveRole.id) && gamePhase !== 'firstNight' && newT.length === 1) {
        setShowKillConfirmModal(newT[0]);
        return;
      }
    } else {
      const action = nightInfo.effectiveRole.nightActionType;
      if(action === 'poison') {
        // 注意：保留永久中毒标记（舞蛇人制造）和亡骨魔中毒标记
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
            // 给出一对与真实阵营不符的组合
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
          const resultText = `善良：${shownGood?.name || '未知'} / 邪恶：${shownEvil?.name || '未知'}`;
          setInspectionResult(resultText);
          setInspectionResultKey(k => k + 1);
          addLogWithDeduplication(
            `${nightInfo.seat.id+1}号(筑梦师) 查验 ${target.id+1}号 -> ${resultText}${shouldFake ? '（假信息）' : ''}`,
            nightInfo.seat.id,
            '筑梦师'
          );
        }
      } else if (rid === 'seamstress') {
        if (hasUsedAbility('seamstress', nightInfo.seat.id)) {
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
          const text = shownSame ? "✅ 同阵营" : "❌ 不同阵营";
          setInspectionResult(text);
          setInspectionResultKey(k => k + 1);
          addLogWithDeduplication(
            `${nightInfo.seat.id+1}号(女裁缝) 查验 ${aId+1}号 与 ${bId+1}号 -> ${text}${shouldFake ? '（假信息）' : ''}`,
            nightInfo.seat.id,
            '女裁缝'
          );
          markAbilityUsed('seamstress', nightInfo.seat.id);
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
          const targetSeat = seats.find(s => s.id === nightInfo.seat.id);
          if (targetSeat) {
            const fakeInfoCheck = drunkFirstInfoRef.current 
              ? shouldShowFakeInfo(targetSeat, drunkFirstInfoRef.current, isVortoxWorld)
              : { showFake: currentHint.isPoisoned || isVortoxWorld, isFirstTime: false };
            if (fakeInfoCheck.showFake) {
              resultText = getMisinformation.fortuneTeller(hasEvil);
              fakeInspectionResultRef.current = resultText;
            } else {
              resultText = hasEvil ? "✅ 是" : "❌ 否";
            }
          } else {
            resultText = hasEvil ? "✅ 是" : "❌ 否";
          }
        } else {
          resultText = hasEvil ? "✅ 是" : "❌ 否";
        }
        setInspectionResult(resultText);
        setInspectionResultKey(k => k + 1);
        
        // 添加详细日志说明查验结果的原因（说明为什么是/否）
        const targetIds = newT.map(t => t + 1).join('号与');
        const resultTextClean = resultText === "✅ 是" ? "是" : "否";
        const reason = hasEvil 
          ? `因为其中有人被注册为恶魔（可能是真恶魔，也可能是隐士/红罗刹的误导）`
          : `因为其中没有人被注册为恶魔`;
        addLogWithDeduplication(
          `占卜师查验 ${targetIds}号：结果【${resultTextClean}】，${reason}。`,
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
        // 健康状态：在控制台显示真实身份
        if (t?.role) {
          const resultText = `${newT[0]+1}号玩家的真实身份是${t.role.name}`;
          setInspectionResult(resultText);
          setInspectionResultKey(k => k + 1);
          // 记录日志
          addLogWithDeduplication(
            `${nightInfo.seat.id+1}号(守鸦人) 查验 ${newT[0]+1}号 -> ${t.role.name}`,
            nightInfo.seat.id,
            '守鸦人'
          );
        }
      } else {
        // 中毒/醉酒状态：先弹出选择假身份的弹窗
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
        // 假信息：随机两名存活玩家
        const aliveIds = seats.filter(s => !s.isDead).map(s => s.id);
        const shuffled = [...aliveIds].sort(() => Math.random() - 0.5);
        infoIds = shuffled.slice(0, 2);
      }
      addLog(`${nightInfo.seat.id+1}号(贤者) 得知 ${infoIds.map(x=>x+1).join('号、')}号，其中一人是杀死自己的恶魔${shouldFake ? '（假信息）' : ''}`);
      setInspectionResult(`你得知：${infoIds.map(x=>`${x+1}号`).join('、')}（其中一人为恶魔）`);
      setInspectionResultKey(k => k + 1);
      return;
    }
  };

  const handleConfirmAction = () => {
    if(!nightInfo) return;
    // 麻脸巫婆：选择玩家与目标角色进行变更
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
        alert('该角色已在场上，无法变身为已存在角色。');
        return;
      }

      setSeats(prev => prev.map(s => {
        if (s.id !== targetId) return s;
        const cleaned = cleanseSeatStatuses({
          ...s,
          isDemonSuccessor: false,
          // 保留僵怖真实死亡标记，其他死亡/中毒状态全部清理
          isZombuulTrulyDead: s.isZombuulTrulyDead,
        }, { keepDeathState: true });
        const nextSeat = { ...cleaned, role: newRole, charadeRole: null };
        if (s.hasAbilityEvenDead) {
          addLog(`${s.id+1}号因亡骨魔获得的“死而有能”效果在变身为 ${newRole.name} 时已失效。`);
        }
        return nextSeat;
      }));

      const createdNewDemon = newRole.type === 'demon' && targetSeat?.role?.type !== 'demon';
      // 如果创造了新的恶魔，提示说书人决定当晚死亡
      if (createdNewDemon) {
        addLog(`${nightInfo.seat.id+1}号(麻脸巫婆) 将 ${targetId+1}号 变为恶魔，今晚的死亡由说书人决定`);
      } else {
        addLog(`${nightInfo.seat.id+1}号(麻脸巫婆) 将 ${targetId+1}号 变为 ${newRole.name}`);
      }

      // 动态调整唤醒队列：让目标在本夜后续按照行动顺序被唤醒
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
    // 如果有待确认的弹窗（杀人/投毒/哈迪寂亚/守鸦人假身份选择/月之子/理发师等）未处理，则不继续
    if (showKillConfirmModal !== null || showPoisonConfirmModal !== null || showPoisonEvilConfirmModal !== null || showHadesiaKillConfirmModal !== null || 
        showRavenkeeperFakeModal !== null || showMoonchildKillModal !== null || showBarberSwapModal !== null || showStorytellerDeathModal !== null || showSweetheartDrunkModal !== null || showKlutzChoiceModal !== null) {
      return;
    }
    // 教授（夜半狂欢）：一次性复活一名死亡玩家
    if (nightInfo.effectiveRole.id === 'professor_mr' && gamePhase !== 'firstNight') {
      if (hasUsedAbility('professor_mr', nightInfo.seat.id)) {
        continueToNextAction();
        return;
      }
      const availableReviveTargets = seats.filter(s => {
        const r = s.role?.id === 'drunk' ? s.charadeRole : s.role;
        return s.isDead && r && r.type === 'townsfolk' && !s.isDemonSuccessor;
      });
      if (availableReviveTargets.length === 0) {
        addLog(`${nightInfo.seat.id+1}号(教授) 无可复活的镇民，跳过`);
        continueToNextAction();
        return;
      }
      if (selectedActionTargets.length !== 1) {
        return; // 需选择一名死亡玩家
      }
      const targetId = selectedActionTargets[0];
      const targetSeat = seats.find(s => s.id === targetId);
      if (!targetSeat || !targetSeat.isDead) return;
      const targetRole = targetSeat.role?.id === 'drunk' ? targetSeat.charadeRole : targetSeat.role;
      if (!targetRole || targetSeat.isDemonSuccessor || targetRole.type !== 'townsfolk') {
        alert('教授只能复活死亡的镇民。');
        return;
      }
      const hadEvenDead = !!targetSeat.hasAbilityEvenDead;
      // 复活：清理死亡/中毒相关状态
      setSeats(prev => prev.map(s => {
        if (s.id !== targetId) return s;
        return reviveSeat({
          ...s,
          isEvilConverted: false,
          isZombuulTrulyDead: s.isZombuulTrulyDead, // 保留僵怖真实死亡标记
        });
      }));
      // 移除普卡队列中的目标
      setPukkaPoisonQueue(prev => prev.filter(entry => entry.targetId !== targetId));
      setDeadThisNight(prev => prev.filter(id => id !== targetId));
      addLog(`${nightInfo.seat.id+1}号(教授) 复活了 ${targetId+1}号`);
      if (hadEvenDead) {
        addLog(`${targetId+1}号此前因亡骨魔获得的“死而有能”效果随着复活已失效。`);
      }
      markAbilityUsed('professor_mr', nightInfo.seat.id);
      setSelectedActionTargets([]);
      insertIntoWakeQueueAfterCurrent(targetId, { logLabel: `${targetId+1}号(复活)` });
      continueToNextAction();
      return;
    }
    // 巡山人：命中落难少女则变成未在场镇民
    if (nightInfo.effectiveRole.id === 'ranger' && gamePhase !== 'firstNight') {
      if (hasUsedAbility('ranger', nightInfo.seat.id)) {
        continueToNextAction();
        return;
      }
      if (selectedActionTargets.length !== 1) return;
      const targetId = selectedActionTargets[0];
      const targetSeat = seats.find(s => s.id === targetId);
      if (!targetSeat || targetSeat.isDead) return;
      const targetRoleId = getSeatRoleId(targetSeat);
      markAbilityUsed('ranger', nightInfo.seat.id);
      setSelectedActionTargets([]);
      if (targetRoleId !== 'damsel') {
        addLog(`${nightInfo.seat.id+1}号(巡山人) 选择了 ${targetId+1}号，但未命中落难少女`);
        continueToNextAction();
        return;
      }
      setShowRangerModal({ targetId, roleId: null });
      return;
    }

    // 沙巴洛斯：每晚选择两名玩家杀死（暂不实现复活效果）
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
              addLog(`${nightInfo.seat.id+1}号(沙巴洛斯) 杀死了 ${targets.map(x=>x+1).join('、')}号（本工具暂未实现其复活效果，请说书人按规则手动裁定是否复活）`);
              continueToNextAction();
            }
          }
        });
      });
      return;
    }

    // 珀：支持“本夜不杀（蓄力）”与下夜“三连杀”
    if (nightInfo.effectiveRole.id === 'po' && gamePhase !== 'firstNight') {
      const seatId = nightInfo.seat.id;
      const charged = poChargeState[seatId] === true;
      const uniqueTargets = Array.from(new Set(selectedActionTargets));

      // 未蓄力：允许0或1个目标；0=本夜不杀（蓄力），1=普通杀一人
      if (!charged) {
        if (uniqueTargets.length > 1) return;
        if (uniqueTargets.length === 0) {
          // 本夜不杀人：蓄力
          setPoChargeState(prev => ({ ...prev, [seatId]: true }));
          addLog(`${seatId+1}号(珀) 本夜未杀人，蓄力一次，下一个夜晚将爆发杀 3 人。`);
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

      // 已蓄力：必须选择3名不同目标，本夜爆发杀 3 人
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
              addLog(`${seatId+1}号(珀) 爆发杀死了 ${uniqueTargets.map(x=>x+1).join('、')}号`);
              continueToNextAction();
            }
          }
        });
      });
      return;
    }

    // 旅店老板：确认两名目标，给予保护并随机致醉一人
    if (nightInfo.effectiveRole.id === 'innkeeper' && gamePhase !== 'firstNight') {
      if (selectedActionTargets.length !== 2) return;
      const [aId, bId] = selectedActionTargets;
      setSelectedActionTargets([]);
      const drunkTargetId = Math.random() < 0.5 ? aId : bId;
      setSeats(prev => prev.map(s => {
        if (s.id === aId || s.id === bId) {
          const base = { ...s, isProtected: true, protectedBy: nightInfo.seat.id };
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
      addLog(`${nightInfo.seat.id+1}号(旅店老板) 今晚保护了 ${aId+1}号 与 ${bId+1}号，他们不会被恶魔杀死，其中一人醉酒到下个黄昏（信息可能错误）`);
      continueToNextAction();
      return;
    }
    
    // 检查是否有待确认的操作（投毒者和恶魔的确认弹窗已在toggleTarget中处理）
    // 如果有打开的确认弹窗，不继续流程
    if(showKillConfirmModal !== null || showPoisonConfirmModal !== null || showPoisonEvilConfirmModal !== null || showHadesiaKillConfirmModal !== null || 
       showRavenkeeperFakeModal !== null || showMoonchildKillModal !== null || showSweetheartDrunkModal !== null || showKlutzChoiceModal !== null) {
      return;
    }
    
    // 没有待确认的操作，继续流程
    continueToNextAction();
  };
  
  const continueToNextAction = () => {
    // 保存历史记录
    saveHistory();
    
    // 检查是否有玩家在夜晚死亡，需要跳过他们的环节（但亡骨魔杀死的爪牙保留能力，需要被唤醒）
    const currentDead = seats.filter(s => {
      const roleId = getSeatRoleId(s);
      const diedTonight = deadThisNight.includes(s.id);
      if (roleId === 'ravenkeeper' && diedTonight) return false;
      return s.isDead && !s.hasAbilityEvenDead;
    });
    setWakeQueueIds(prev => prev.filter(id => !currentDead.find(d => d.id === id)));
    
    // 如果当前玩家已死亡（且不保留能力），跳过到下一个
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
    
    // 首晚恶魔行动后，触发"爪牙认识恶魔"环节（在控制台显示）
    if (gamePhase === 'firstNight' && nightInfo && nightInfo.effectiveRole.type === 'demon') {
      // 找到恶魔座位
      const demonSeat = seats.find(s => 
        (s.role?.type === 'demon' || s.isDemonSuccessor) && !s.isDead
      );
      // 找到所有爪牙
      const minionSeats = seats.filter(s => 
        s.role?.type === 'minion' && !s.isDead
      );
      
      // 如果有恶魔和爪牙，且罂粟种植者不在场或已死亡，触发"爪牙认识恶魔"环节
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
      // 夜晚结束，显示死亡报告
      // 检测夜晚期间死亡的玩家（通过deadThisNight记录）
      if(deadThisNight.length > 0) {
        const deadNames = deadThisNight.map(id => `${id+1}号`).join('、');
        setShowNightDeathReportModal(`昨晚${deadNames}玩家死亡`);
      } else {
        setShowNightDeathReportModal("昨天是个平安夜");
      }
    }
  };
  
  // 安全兜底：如果夜晚阶段存在叫醒队列但无法生成 nightInfo，自动跳过当前环节或直接结束夜晚
  useEffect(() => {
    if (!(gamePhase === 'firstNight' || gamePhase === 'night')) return;
    if (wakeQueueIds.length === 0) return;
    // 只有在当前索引合法但 nightInfo 仍为 null 时，才认为是异常卡住
    if (currentWakeIndex < 0 || currentWakeIndex >= wakeQueueIds.length) return;
    if (nightInfo) return;
    
    // 还有后续角色时，直接跳到下一个夜晚行动
    if (currentWakeIndex < wakeQueueIds.length - 1) {
      continueToNextAction();
      return;
    }
    
    // 已经是最后一个角色且无法生成 nightInfo：直接结束夜晚并进入天亮结算
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
  
  // 计算确认按钮的禁用状态
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

    if (roleId === 'professor_mr' && phase !== 'firstNight' && !hasUsedAbility('professor_mr', nightInfo.seat.id)) {
      const availableReviveTargets = seats.filter(s => {
        const r = s.role?.id === 'drunk' ? s.charadeRole : s.role;
        return s.isDead && r && r.type === 'townsfolk' && !s.isDemonSuccessor;
      });
      if (availableReviveTargets.length > 0 && selectedActionTargets.length !== 1) return true;
    }

    if (roleId === 'ranger' && phase !== 'firstNight' && !hasUsedAbility('ranger', nightInfo.seat.id) && selectedActionTargets.length !== 1) {
      return true;
    }

    if (roleId === 'fortune_teller' && selectedActionTargets.length !== 2) return true;
    if (roleId === 'imp' && phase !== 'firstNight' && actionType !== 'none' && selectedActionTargets.length !== 1) return true;
    if (roleId === 'poisoner' && actionType !== 'none' && selectedActionTargets.length !== 1) return true;
    if (roleId === 'innkeeper' && phase !== 'firstNight' && selectedActionTargets.length !== 2) return true;
    if (roleId === 'shabaloth' && phase !== 'firstNight' && selectedActionTargets.length !== 2) return true;
    if (roleId === 'po' && phase !== 'firstNight') {
      const seatId = nightInfo.seat.id;
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
  
  // 确认夜晚死亡报告后进入白天
  const confirmNightDeathReport = () => {
    setShowNightDeathReportModal(null);
    
    // 白天开始：清理仅限夜晚的状态，但保留魔鬼代言人的跨日保护
    cleanStatusesForNewDay();
    
    // 清除所有保护状态（僧侣的保护只在夜晚有效）
    setSeats(p => p.map(s => ({...s, isProtected: false, protectedBy: null})));
    
    // 检查罂粟种植者是否死亡，如果死亡，告知爪牙和恶魔彼此
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
    
    // 检查农夫是否在夜晚死亡，如果死亡，转换一名善良玩家为农夫
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
    // 使用seatsRef确保获取最新的seats状态，然后检查游戏结束条件
    const currentSeats = seatsRef.current;
    // 检查游戏结束条件（包括存活人数）
    if (checkGameOver(currentSeats)) {
      return;
    }
    setGamePhase("day");
  };
  
  const getDemonDisplayName = (roleId?: string, fallbackName?: string) => {
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
  };

  type KillPlayerOptions = {
    recordNightDeath?: boolean;
    keepInWakeQueue?: boolean;
    seatTransformer?: (seat: Seat) => Seat;
    skipGameOverCheck?: boolean;
    executedPlayerId?: number | null;
    onAfterKill?: (latestSeats: Seat[]) => void;
  };

  const killPlayer = useCallback(
    (targetId: number, options: KillPlayerOptions = {}) => {
      const seatsSnapshot = seatsRef.current || seats;
      const targetSeat = seatsSnapshot.find(s => s.id === targetId);
      if (!targetSeat) return;
      const killerRoleId = nightInfo?.effectiveRole.id;

      // 茶艺师动态保护：实时计算邻座是否提供保护
      if (hasTeaLadyProtection(targetSeat, seatsSnapshot)) {
        addLog(`${targetId + 1}号 被茶艺师保护，未死亡`);
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

      // 默认：月之子/呆瓜死亡不立刻结算，等待后续选择
      const shouldSkipGameOver = skipGameOverCheck ?? (targetSeat.role?.id === 'moonchild' || targetSeat.role?.id === 'klutz');

      let updatedSeats: Seat[] = [];
      setSeats(prev => {
        updatedSeats = prev.map(s => {
          if (s.id !== targetId) return s;
          let next: Seat = { ...s, isDead: true };
          // 僵怖假死状态再次被杀死：算作真正死亡
          if (s.role?.id === 'zombuul' && s.isFirstDeathForZombuul && !s.isZombuulTrulyDead) {
            next = { ...next, isZombuulTrulyDead: true };
          }
          // 呆瓜死亡标记，避免重复触发
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

      // 理发师（夜半狂欢版）死亡：恶魔当晚可选择两名玩家交换角色（不能选择恶魔）
      if (targetSeat.role?.id === 'barber_mr') {
        const demon = seatsSnapshot.find(s => (s.role?.type === 'demon' || s.isDemonSuccessor) && !s.isDead);
        if (demon) {
          setShowBarberSwapModal({ demonId: demon.id, firstId: null, secondId: null });
          addLog(`${targetSeat.id + 1}号(理发师)死亡，恶魔可选择两名玩家交换角色`);
        }
      }

      const finalize = (latestSeats?: Seat[]) => {
        // 使用最新的 seats 状态，按优先级选择：入参 → 最新引用 → 本次更新快照 → 状态闭包
        const seatsToUse =
          (latestSeats && latestSeats.length ? latestSeats : null) ??
          (seatsRef.current && seatsRef.current.length ? seatsRef.current : null) ??
          (updatedSeats && updatedSeats.length ? updatedSeats : null) ??
          (seats && seats.length ? seats : null);

        if (!seatsToUse || seatsToUse.length === 0) {
          console.error('killPlayer finalize: seatsToUse为空或无效，跳过游戏结束检查');
          onAfterKill?.(seatsToUse || []);
          return;
        }

        const finalSeats = seatsToUse;

        // 诺-达：杀人后邻近两名镇民中毒（永久，直到游戏结束）
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
            addLog(`诺-达使 ${poisoned.map(p => `${p.id+1}号`).join('、')}号 中毒`);
          }
        }

        // 方古：若杀死外来者且未转化过，则目标变恶魔，自己死亡
        if (killerRoleId === 'fang_gu' && !fangGuConverted) {
          const targetRole = targetSeat.role;
          const isOutsider = targetRole?.type === 'outsider';
          if (isOutsider) {
            const fangGuRole = roles.find(r => r.id === 'fang_gu');
            setSeats(p => p.map(s => {
              if (s.id === targetId) {
                return cleanseSeatStatuses({ ...s, role: fangGuRole || s.role, isDemonSuccessor: false });
              }
              if (s.id === (nightInfo?.seat.id ?? -1)) {
                return { ...s, isDead: true };
              }
              return s;
            }));
            setFangGuConverted(true);
            if (nightInfo?.seat.id !== undefined) {
              addLog(`${nightInfo.seat.id+1}号(方古) 杀死外来者 ${targetId+1}号，目标转化为方古，原方古死亡`);
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
        addLog(`${targetId + 1}号(呆瓜) 死亡，必须选择一名存活玩家`);
        return;
      }

      if (targetSeat.role?.id === 'sweetheart') {
        setShowSweetheartDrunkModal({
          sourceId: targetId,
          onResolve: finalize,
        });
        addLog(`${targetId + 1}号(心上人) 死亡，将导致一名玩家今晚至次日黄昏醉酒`);
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
    [seats, enqueueRavenkeeperIfNeeded, checkGameOver]
  );

  type KillProcessResult = 'pending' | 'resolved';

  const processDemonKill = (
    targetId: number,
    options: { skipMayorRedirectCheck?: boolean; mayorId?: number | null } = {}
  ): KillProcessResult => {
    if (!nightInfo) return 'resolved';
    const killerRoleId = nightInfo.effectiveRole.id;
    const seatsSnapshot = seatsRef.current || seats;
    const target = seatsSnapshot.find(s => s.id === targetId);
    if (!target) return 'resolved';

    // 检查保护是否有效：如果被保护，必须检查保护者（僧侣）是否中毒/醉酒
    let isEffectivelyProtected = false;
    if (target.isProtected && target.protectedBy !== null) {
      const protector = seatsSnapshot.find(s => s.id === target.protectedBy);
      if (protector) {
        // 如果保护者中毒/醉酒，保护绝对无效，无论isProtected是否为true
        const isProtectorPoisoned = protector.isPoisoned || protector.isDrunk || protector.role?.id === "drunk";
        if (isProtectorPoisoned) {
          // 保护者中毒/醉酒，保护无效，同时清除错误的保护状态
          isEffectivelyProtected = false;
          setSeats(p => p.map(s => 
            s.id === targetId ? {...s, isProtected: false, protectedBy: null} : s
          ));
        } else {
          // 保护者健康，保护有效
          isEffectivelyProtected = true;
        }
      } else {
        // 保护者不存在，保护无效
        isEffectivelyProtected = false;
      }
    }
    const teaLadyProtected = hasTeaLadyProtection(target, seatsSnapshot);
    
    // 检查目标是否可以被杀死：僵怖假死状态可以被杀死
    const canBeKilled = target && !isEffectivelyProtected && !teaLadyProtected && target.role?.id !== 'soldier' && 
      (!target.isDead || (target.role?.id === 'zombuul' && target.isFirstDeathForZombuul && !target.isZombuulTrulyDead));

    // 如果因为保护或士兵能力导致无法杀死（且目标存活），添加统一日志说明
  if (target && !target.isDead && !canBeKilled) {
    const demonName = getDemonDisplayName(nightInfo.effectiveRole.id, nightInfo.effectiveRole.name);
    let protectionReason = '';
    
    if (target.role?.id === 'soldier') {
      protectionReason = '士兵能力';
    } else if (isEffectivelyProtected) {
      protectionReason = '僧侣保护';
    } else if (teaLadyProtected) {
      protectionReason = '茶艺师保护';
    }
    
    if (protectionReason) {
      addLogWithDeduplication(
        `恶魔(${demonName}) 攻击 ${targetId+1}号，但因为【${protectionReason}】，${targetId+1}号没有死亡。`,
        nightInfo.seat.id,
        demonName
      );
      setShowAttackBlockedModal({
        targetId,
        reason: protectionReason,
        demonName,
      });
    }
  }

    // 市长特殊处理：允许死亡转移
    if (canBeKilled && !options.skipMayorRedirectCheck && target.role?.id === 'mayor') {
      const aliveCandidates = seats.filter(s => !s.isDead && s.id !== targetId);
      if (aliveCandidates.length > 0) {
        setMayorRedirectTarget(null);
        setShowKillConfirmModal(null);
        setShowMayorRedirectModal({
          targetId,
          demonName: getDemonDisplayName(nightInfo.effectiveRole.id, nightInfo.effectiveRole.name)
        });
        return 'pending';
      }
    }
    
    const mayorNote = options.mayorId !== undefined && options.mayorId !== null 
      ? `（由${options.mayorId + 1}号市长转移）`
      : '';

    if(canBeKilled) {
      // 夜半狂欢亡骨魔特殊处理：杀死爪牙时，爪牙保留能力，且邻近的两名镇民之一中毒
      if (nightInfo.effectiveRole.id === 'vigormortis_mr' && target.role?.type === 'minion') {
        // 找到邻近的两名镇民
        const targetIndex = seats.findIndex(s => s.id === targetId);
        const totalSeats = seats.length;
        const leftIndex = (targetIndex - 1 + totalSeats) % totalSeats;
        const rightIndex = (targetIndex + 1) % totalSeats;
        const leftNeighbor = seats[leftIndex];
        const rightNeighbor = seats[rightIndex];
        const townsfolkNeighbors = [leftNeighbor, rightNeighbor].filter(s => 
          s.role?.type === 'townsfolk' && !s.isDead
        );
        
        // 随机选择一名镇民中毒
        const poisonedNeighbor = townsfolkNeighbors.length > 0 ? getRandom(townsfolkNeighbors) : null;
        
        if (poisonedNeighbor) {
          setSeats(p => p.map(s => {
            if (s.id === poisonedNeighbor.id) {
              // 亡骨魔中毒是永久的
              const clearTime = '永久';
              const { statusDetails, statuses } = addPoisonMark(s, 'vigormortis', clearTime);
              const nextSeat = { ...s, statusDetails, statuses };
              return { ...nextSeat, isPoisoned: computeIsPoisoned(nextSeat) };
            }
            return { ...s, isPoisoned: computeIsPoisoned(s) };
          }));
        }

        killPlayer(targetId, {
          keepInWakeQueue: true, // 保留能力，需要夜晚继续唤醒
          seatTransformer: seat => ({ ...seat, hasAbilityEvenDead: true }),
          onAfterKill: () => {
            if (nightInfo) {
              addLogWithDeduplication(
                `${nightInfo.seat.id+1}号(亡骨魔) 杀害 ${targetId+1}号(爪牙)${mayorNote}，爪牙保留能力${poisonedNeighbor ? `，${poisonedNeighbor.id+1}号(邻近镇民)中毒` : ''}`,
                nightInfo.seat.id,
                '亡骨魔'
              );
            }
          }
        });
      } else {
        // 正常杀死其他玩家
        killPlayer(targetId, {
          onAfterKill: () => {
            if (nightInfo) {
              // 涡流：标记假信息环境
              if (killerRoleId === 'vortox') {
                setIsVortoxWorld(true);
              }
              const demonName = getDemonDisplayName(nightInfo.effectiveRole.id, nightInfo.effectiveRole.name);
              addLogWithDeduplication(
                `${nightInfo.seat.id+1}号(${demonName}) 杀害 ${targetId+1}号${mayorNote}，${targetId+1}号已在夜晚死亡`,
                nightInfo.seat.id,
                demonName
              );
            }
          }
        });
      }
    }
    return 'resolved';
  };

  // 确认杀死玩家
  const confirmKill = () => {
    if(!nightInfo || showKillConfirmModal === null) return;
    const targetId = showKillConfirmModal;
    const impSeat = nightInfo.seat;
    
    // 如果当前执行杀人能力的角色本身中毒/醉酒，则本次夜间攻击应视为“无事发生”
    const actorSeat = seats.find(s => s.id === nightInfo.seat.id);
    if (isActorDisabledByPoisonOrDrunk(actorSeat, nightInfo.isPoisoned)) {
      addLogWithDeduplication(
        `${nightInfo.seat.id+1}号(${nightInfo.effectiveRole.name}) 处于中毒/醉酒状态，本夜对 ${targetId+1}号 的攻击无效（无事发生）`,
        nightInfo.seat.id,
        nightInfo.effectiveRole.name
      );
      setShowKillConfirmModal(null);
      setSelectedActionTargets([]);
      continueToNextAction();
      return;
    }
    
    // 如果小恶魔选择自己，触发身份转移或自杀结算
    if (targetId === impSeat.id && nightInfo.effectiveRole.id === 'imp') {
      // 找到所有活着的爪牙
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
              // 新小恶魔：标记为恶魔继任者，更新角色为小恶魔，添加"小恶魔（传）"标记
              const statusDetails = [...(s.statusDetails || []), '小恶魔（传）'];
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
        
        // 正常传位给爪牙（小恶魔自杀时，优先传位给爪牙，不检查红唇女郎）
        // 检查游戏结束（不应该结束，因为新小恶魔还在）
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
          
          // 显眼的高亮提示：提醒说书人唤醒新恶魔玩家
          console.warn('%c⚠️ 重要提醒：小恶魔传位成功 ⚠️', 'color: #FFD700; font-size: 20px; font-weight: bold; background: #1a1a1a; padding: 10px; border: 3px solid #FFD700;');
          console.warn(`%c请立即唤醒 ${newImp.id+1}号玩家，向其出示"你是小恶魔"卡牌！`, 'color: #FF6B6B; font-size: 16px; font-weight: bold; background: #1a1a1a; padding: 8px;');
          console.warn(`%c注意：新恶魔今晚不行动，从下一夜开始才会进入唤醒队列。`, 'color: #4ECDC4; font-size: 14px; background: #1a1a1a; padding: 5px;');
        }
        
        // 记录原小恶魔的死亡
        setDeadThisNight(p => [...p, impSeat.id]);
        enqueueRavenkeeperIfNeeded(impSeat.id);
      } else {
        // 如果没有活着的爪牙，小恶魔自杀但无法传位：直接死亡，结算游戏
        addLogWithDeduplication(
          `${impSeat.id+1}号(小恶魔) 选择自己，但场上无爪牙可传位 —— ${impSeat.id+1}号直接死亡`,
          impSeat.id,
          '小恶魔'
        );
        // 使用通用杀人流程，触发死亡与游戏结束判定
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
      const result = processDemonKill(targetId);
      if (result === 'pending') return;
    }
    setShowKillConfirmModal(null);
    if (moonchildChainPendingRef.current) return;
    continueToNextAction();
  };

  const confirmMayorRedirect = (redirectTargetId: number | null) => {
    if (!nightInfo || !showMayorRedirectModal) return;
    const mayorId = showMayorRedirectModal.targetId;
    const demonName = showMayorRedirectModal.demonName;

    setShowMayorRedirectModal(null);

    if (redirectTargetId === null) {
      // 不转移，市长自己死亡
      processDemonKill(mayorId, { skipMayorRedirectCheck: true });
      setShowKillConfirmModal(null);
      continueToNextAction();
      return;
    }

    addLogWithDeduplication(
      `${nightInfo.seat.id+1}号(${demonName}) 攻击市长 ${mayorId+1}号，死亡转移给 ${redirectTargetId+1}号`,
      nightInfo.seat.id,
      demonName
    );

    processDemonKill(redirectTargetId, { skipMayorRedirectCheck: true, mayorId });
    setShowKillConfirmModal(null);
    if (moonchildChainPendingRef.current) return;
    continueToNextAction();
  };

  // 确认哈迪寂亚杀死3名玩家
  const confirmHadesiaKill = () => {
    if(!nightInfo || !showHadesiaKillConfirmModal || showHadesiaKillConfirmModal.length !== 3) return;
    const targetIds = showHadesiaKillConfirmModal;
    
    // 哈迪寂亚：三名玩家秘密决定自己的命运，如果他们全部存活，他们全部死亡
    // 这里简化处理：说书人需要手动决定哪些玩家死亡
    // 所有玩家都会得知哈迪寂亚选择了谁
    const targetNames = targetIds.map(id => `${id+1}号`).join('、');
    addLog(`${nightInfo.seat.id+1}号(哈迪寂亚) 选择了 ${targetNames}，所有玩家都会得知这个选择`);
    addLog(`请说书人决定 ${targetNames} 的命运。如果他们全部存活，他们全部死亡。`);
    
    // 这里需要说书人手动处理，暂时只记录日志
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
      addLog(`${sourceId + 1}号(月之子) 选择 ${targetId + 1}号 与其陪葬（善良，今晚死亡）`);
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
      // 心上人：死亡时使一名玩家今晚至次日黄昏醉酒
      const clearTime = '次日黄昏';
      const { statusDetails, statuses } = addDrunkMark(s, 'sweetheart', clearTime);
      return { ...s, isDrunk: true, statusDetails, statuses };
    }));
    addLog(`${sourceId + 1}号(心上人) 死亡，使 ${targetId + 1}号 今晚至次日黄昏醉酒`);

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
      addLog(`${sourceId + 1}号(呆瓜) 选择了 ${target.id + 1}号（邪恶），善良阵营立即失败`);
      setWinResult('evil');
      setWinReason('呆瓜误判');
      setGamePhase('gameOver');
      return;
    }
    addLog(`${sourceId + 1}号(呆瓜) 选择了 ${target.id + 1}号（非邪恶），无事发生`);
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
      const confirmed = window.confirm('你确认要让本晚无人死亡吗？这会让本局更偏离标准规则，只建议在你非常确定时使用。');
      if (!confirmed) return;
      addLog(`说书人选择本晚无人死亡（因${sourceId + 1}号变为新恶魔），这是一次偏离标准规则的特殊裁决。`);
      continueToNextAction();
      return;
    }

    addLog(`说书人指定 ${targetId + 1}号 当晚死亡（因${sourceId + 1}号变恶魔）`);
    killPlayer(targetId, {
      onAfterKill: () => {
        continueToNextAction();
      }
    });
  };
  
  // 确认下毒（善良玩家）
  const confirmPoison = () => {
    const targetId = showPoisonConfirmModal;
    if(!nightInfo || targetId === null) return;
    
    // 如果投毒者本身中毒/醉酒，则本次下毒应视为“无事发生”
    const actorSeat = seats.find(s => s.id === nightInfo.seat.id);
    if (isActorDisabledByPoisonOrDrunk(actorSeat, nightInfo.isPoisoned)) {
      addLogWithDeduplication(
        `${nightInfo.seat.id+1}号(投毒者) 处于中毒/醉酒状态，本夜对 ${targetId+1}号 的下毒无效（无事发生）`,
        nightInfo.seat.id,
        '投毒者'
      );
      setShowPoisonConfirmModal(null);
      setSelectedActionTargets([]);
      continueToNextAction();
      return;
    }
    
    // 注意：保留永久中毒标记（舞蛇人制造）和亡骨魔中毒标记
    setSeats(p => p.map(s => {
      if (s.id === targetId) {
        // 投毒者：当晚和明天白天中毒，在次日黄昏清除
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
      `${nightInfo.seat.id+1}号(投毒者) 对 ${targetId+1}号 下毒`,
      nightInfo.seat.id,
      '投毒者'
    );
    setShowPoisonConfirmModal(null);
    setSelectedActionTargets([]);
    continueToNextAction();
  };
  
  // 确认对邪恶玩家下毒（二次确认）
  const confirmPoisonEvil = () => {
    const targetId = showPoisonEvilConfirmModal;
    if(!nightInfo || targetId === null) return;
    
    // 如果投毒者本身中毒/醉酒，则本次下毒应视为“无事发生”
    const actorSeat = seats.find(s => s.id === nightInfo.seat.id);
    if (isActorDisabledByPoisonOrDrunk(actorSeat, nightInfo.isPoisoned)) {
      addLogWithDeduplication(
        `${nightInfo.seat.id+1}号(投毒者) 处于中毒/醉酒状态，本夜对 ${targetId+1}号(队友) 的下毒无效（无事发生）`,
        nightInfo.seat.id,
        '投毒者'
      );
      setShowPoisonEvilConfirmModal(null);
      setSelectedActionTargets([]);
      continueToNextAction();
      return;
    }
    
    // 注意：保留永久中毒标记（舞蛇人制造）和亡骨魔中毒标记
    setSeats(p => p.map(s => {
      if (s.id === targetId) {
        // 投毒者：当晚和明天白天中毒，在次日黄昏清除
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
      `${nightInfo.seat.id+1}号(投毒者) 对 ${targetId+1}号(队友) 下毒`,
      nightInfo.seat.id,
      '投毒者'
    );
    setShowPoisonEvilConfirmModal(null);
    setSelectedActionTargets([]);
    continueToNextAction();
  };

  // 哈迪寂亚：设置单个玩家的命运（生/死）
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

    const choiceDesc = baseTargets.map(id => `[${id+1}号:${choiceMap[id] === 'die' ? '死' : '生'}]`).join('、');
    addLog(`${nightInfo.seat.id+1}号(${demonName}) 选择了 ${choiceDesc}`);
    if (allChooseLive) {
      addLog(`三名玩家都选择"生"，按规则三人全部死亡`);
    } else if (finalTargets.length > 0) {
      addLog(`选择"死"的玩家：${finalTargets.map(x=>x+1).join('、')}号将立即死亡`);
    } else {
      addLog('未选择"死"的玩家，未触发死亡');
    }

    // 保存当前唤醒索引，用于后续继续流程
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
              addLog(`${nightInfo?.seat.id+1 || '?'}号(${demonName}) 处决了 ${finalTargets.map(x=>x+1).join('、')}号`);
              // 延迟执行，确保状态更新完成
              setTimeout(() => {
                // 使用 setWakeQueueIds 的回调形式来获取最新的队列状态
                setWakeQueueIds(prevQueue => {
                  // 过滤掉已死亡的玩家（killPlayer 已经移除了死亡的玩家，但这里再次确认）
                  const filteredQueue = prevQueue.filter(id => {
                    const seat = latestSeats?.find(s => s.id === id);
                    return seat && !seat.isDead;
                  });
                  
                  // 如果当前索引超出范围或没有更多角色，结束夜晚
                  if (currentWakeIdx >= filteredQueue.length - 1 || filteredQueue.length === 0) {
                    // 清空队列并重置索引
                    setCurrentWakeIndex(0);
                    // 延迟显示死亡报告，确保状态更新完成
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
                    // 继续下一个行动
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

  const executePlayer = (id: number, options?: { skipLunaticRps?: boolean; forceExecution?: boolean }) => {
    const seatsSnapshot = seatsRef.current || seats;
    const t = seatsSnapshot.find(s => s.id === id);
    if (!t) return;
    const skipLunaticRps = options?.skipLunaticRps;
    const forceExecution = options?.forceExecution;

    // 圣徒处决前强提醒：未确认时不继续后续逻辑
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

    // 茶艺师动态保护：邻座善良茶艺师保护的善良玩家无法被处决
    if (hasTeaLadyProtection(t, seatsSnapshot)) {
      addLog(`${id+1}号 被茶艺师保护，处决无效`);
      setExecutedPlayerId(id);
      setCurrentDuskExecution(id);
      return;
    }
    
    // 魔鬼代言人保护：当日处决免疫
    if (hasExecutionProof(t)) {
      addLog(`${id+1}号 受到魔鬼代言人保护，处决无效`);
      setExecutedPlayerId(id);
      setCurrentDuskExecution(id);
      return;
    }
    
    const isZombuul = t.role?.id === 'zombuul';
    const zombuulLives = t.zombuulLives ?? 1;
    
    const markDeath = (overrides: Partial<Seat> = {}) =>
      seats.map(s => s.id === id ? { ...s, isDead: true, ...overrides } : s);
    
    // 僵怖第一次被处决：假死，保留夜间行动，但消耗一次僵怖生命
    if (isZombuul && zombuulLives > 0 && !t.isZombuulTrulyDead && !t.isFirstDeathForZombuul) {
      const updatedSeats = seats.map(s => {
        if (s.id !== id) return s;
        const details = s.statusDetails || [];
        const hasFakeDeathTag = details.includes('僵怖假死');
        return {
          ...s,
          // UI 可以通过状态标签体现假死，但逻辑上仍视为存活
          isDead: false,
          isFirstDeathForZombuul: true,
          isZombuulTrulyDead: false,
          zombuulLives: Math.max(0, zombuulLives - 1),
          statusDetails: hasFakeDeathTag ? details : [...details, '僵怖假死']
        };
      });
      
      setSeats(updatedSeats);
      addLog(`${id+1}号(僵怖) 被处决（假死，游戏继续）`);
      setExecutedPlayerId(id);
      setTodayExecutedId(id);
      setCurrentDuskExecution(id);
      
      // 检查其他即时结束条件（如圣徒），正常情况下不会结束
      if (checkGameOver(updatedSeats, id)) {
        return;
      }
      
      setTimeout(() => {
        startNight(false);
      }, 500);
      return;
    }
    
    // 10. 检查小恶魔是否被处决 - 先检查红唇女郎
    let newSeats = markDeath(isZombuul ? { isZombuulTrulyDead: true, zombuulLives: 0 } : {});
    
    // 优先检查：圣徒被处决导致邪恶方获胜（优先级高于恶魔死亡判定）
    // 这个检查必须在恶魔死亡检查之前，确保圣徒被处决的判定优先级更高
    // 虽然通常不会同时发生，但在复杂结算中要注意优先级
    if (t?.role?.id === 'saint' && !t.isPoisoned) {
      setSeats(newSeats);
      addLog(`${id+1}号 被处决`);
      setExecutedPlayerId(id);
      setCurrentDuskExecution(id);
      setWinResult('evil');
      setWinReason('圣徒被处决');
      setGamePhase('gameOver');
      addLog("游戏结束：圣徒被处决，邪恶胜利");
      return;
    }
    
    // 10. 立即检查恶魔是否死亡（包括所有恶魔类型）
    if ((t.role?.type === 'demon' || t.isDemonSuccessor)) {
      // 僵怖特殊处理：耗尽僵怖生命后再被处决才算真正死亡
      if (isZombuul) {
        const updatedSeats = newSeats.map(s => 
          s.id === id ? { ...s, isZombuulTrulyDead: true, zombuulLives: 0 } : s
        );
        setSeats(updatedSeats);
        addLog(`${id+1}号(僵怖) 被处决（真正死亡）`);
        setWinResult('good');
        setWinReason('僵怖被处决');
        setGamePhase('gameOver');
        addLog("游戏结束：僵怖被处决，好人胜利");
        setExecutedPlayerId(id);
        setCurrentDuskExecution(id);
        return;
      }
      
      // 主谋特殊处理：如果主谋在游戏开始时存活，且恶魔在首夜被处决，邪恶阵营获胜
      if (gamePhase === 'firstNight') {
        const mastermind = seatsSnapshot.find(s => 
          s.role?.id === 'mastermind' && !s.isDead
        );
        if (mastermind) {
          setSeats(newSeats);
          addLog(`${id+1}号 被处决`);
          setExecutedPlayerId(id);
          setCurrentDuskExecution(id);
          setWinResult('evil');
          setWinReason('主谋：恶魔在首夜被处决');
          setGamePhase('gameOver');
          addLog(`游戏结束：主谋在场，恶魔在首夜被处决，邪恶阵营获胜`);
          return;
        }
      }
      
      // 计算处决后的存活玩家数量
      const aliveCount = newSeats.filter(s => !s.isDead).length;
      
      // 检查红唇女郎是否可以变成恶魔
      const scarletWoman = newSeats.find(s => 
        s.role?.id === 'scarlet_woman' && !s.isDead && !s.isDemonSuccessor
      );
      
      // 如果存活玩家数量 >= 5 且红唇女郎存活，让红唇女郎变成恶魔
      if (aliveCount >= 5 && scarletWoman) {
        // 获取被处决的恶魔角色
        const demonRole = t.role;
        if (demonRole) {
          // 将红唇女郎变成恶魔
          const updatedSeats = newSeats.map(s => {
            if (s.id === scarletWoman.id) {
              const statusDetails = [...(s.statusDetails || []), '恶魔（传）'];
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
          
          // 继续游戏，不触发游戏结束
          setExecutedPlayerId(id);
          setCurrentDuskExecution(id);
          
          // 检查游戏结束条件（不应该结束，因为新恶魔还在）
          if (checkGameOver(updatedSeats)) {
            return;
          }
          
          // 进入下一个夜晚
          setTimeout(() => {
            startNight(false);
          }, 500);
          return;
        }
      }
      
      // 如果不满足红唇女郎变身条件，判定好人胜利
      setSeats(newSeats);
      addLog(`${id+1}号(${t.role?.name || '小恶魔'}) 被处决`);
      setWinResult('good');
      setWinReason(`${t.role?.name || '小恶魔'}被处决`);
      setGamePhase('gameOver');
      addLog("游戏结束：恶魔被处决，好人胜利");
      return;
    }
    
    // 无神论者特殊处理：如果说书人被处决（这里用特殊标记表示），好人获胜
    // 注意：实际游戏中，说书人不会被处决，这里只是逻辑标记
    if (t?.role?.id === 'atheist') {
      // 无神论者被处决时，检查是否有特殊标记表示"说书人被处决"
      // 实际游戏中需要说书人手动标记
      // 这里简化处理：如果无神论者被处决，说书人可以手动触发好人获胜
      addLog(`${id+1}号(无神论者) 被处决。如果说书人被处决，好人阵营获胜。`);
    }
    
    // 食人族：获得最后被处决玩家的能力
    const cannibal = seats.find(s => s.role?.id === 'cannibal' && !s.isDead);
    if (cannibal && t && t.role) {
      // 检查被处决的玩家是否是邪恶阵营
      const roleType = t.role.type as RoleType;
      const isEvilExecuted = (roleType === 'demon' || roleType === 'minion' || t.isDemonSuccessor);
      setSeats(p => p.map(s => {
        if (s.id === cannibal.id) {
          // 检查是否有永久中毒（舞蛇人制造）或亡骨魔中毒
          // 这些永久中毒不能被食人族的能力清除
          const hasPermanentPoison = s.statusDetails?.some(d => d.includes('永久中毒')) || false;
          const hasVigormortisPoison = s.statusDetails?.some(d => d.includes('亡骨魔中毒')) || false;
          // 如果被处决的是善良玩家，清除临时中毒（食人族能力造成的中毒）
          // 但必须保留永久中毒和亡骨魔中毒
          // 如果被处决的是邪恶玩家，设置临时中毒，但也要保留永久中毒
          if (isEvilExecuted) {
            // 食人族中毒直到下一个善良玩家被处决
            const clearTime = '下一个善良玩家被处决时';
            const { statusDetails, statuses } = addPoisonMark(s, 'cannibal', clearTime);
            const nextSeat = { ...s, statusDetails, statuses };
            return { 
              ...nextSeat, 
              isPoisoned: computeIsPoisoned(nextSeat),
              // 记录最后被处决的玩家ID，用于后续能力处理
              masterId: id
            };
          } else {
            // 清除食人族中毒，但保留永久中毒和亡骨魔中毒
            const filteredDetails = (s.statusDetails || []).filter(d => !d.includes('食人族中毒'));
            const filteredStatuses = (s.statuses || []).filter(st => 
              !(st.effect === 'Poison' && s.statusDetails?.some(d => d.includes('食人族中毒')))
            );
            const nextSeat = { ...s, statusDetails: filteredDetails, statuses: filteredStatuses };
            return { 
              ...nextSeat, 
              isPoisoned: computeIsPoisoned(nextSeat),
              // 记录最后被处决的玩家ID，用于后续能力处理
              masterId: id
            };
          }
        }
        return s;
      }));
      if (isEvilExecuted) {
        addLog(`${cannibal.id+1}号(食人族) 获得 ${id+1}号的能力，但因该玩家是邪恶的，食人族中毒直到下一个善良玩家被处决`);
      } else {
        addLog(`${cannibal.id+1}号(食人族) 获得 ${id+1}号的能力`);
      }
    }
    
    setSeats(newSeats);
    addLog(`${id+1}号 被处决`); 
    setExecutedPlayerId(id);
    setTodayExecutedId(id);
    // 10. 记录当前黄昏的处决（用于送葬者）
    // 这个记录会在进入下一个黄昏时，更新为lastDuskExecution
    setCurrentDuskExecution(id);
    
    // 立即检查游戏结束条件（包括存活人数和恶魔死亡）
    // 注意：圣徒被处决的检查已经在前面优先处理了，checkGameOver 内部也会检查作为双重保障
    if (checkGameOver(newSeats, id)) {
      return;
    }
    
    // 无神论者特殊胜利条件：如果说书人被处决，好人阵营获胜
    // 注意：这里需要说书人手动标记"说书人被处决"
    // 暂时不自动触发，需要说书人手动处理
    
    // 5. 屏蔽浏览器弹窗，直接进入夜晚
    setTimeout(() => { 
      startNight(false); 
    }, 500);
  };

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
    // 8. 检查提名限制
    if (nominationRecords.nominators.has(sourceId)) {
      addLog(`系统限制：每名玩家每天只能发起一次提名。这是为了减少混乱，不是官方规则的一部分。`);
      return;
    }
    if (nominationRecords.nominees.has(id)) {
      addLog(`系统限制：每名玩家每天只能被提名一次。这是为了减少混乱，不是官方规则的一部分。`);
      return;
    }
    // 女巫：若被诅咒者发起提名且仍有超过3名存活，则其立即死亡
    if (witchActive && witchCursedId !== null) {
      const aliveCount = seats.filter(s => !s.isDead).length;
      if (aliveCount > 3 && witchCursedId === sourceId) {
        addLog(`${sourceId+1}号 发起提名，触发女巫诅咒，立刻死亡`);
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

    // 贞洁者（处女）逻辑处理
    if (target?.role?.id === 'virgin' && !target.isPoisoned) {
      const isFirstNomination = virginOverride?.isFirstTime ?? !target.hasBeenNominated;
      const currentSeats = seats;

      // 首次提名且未提供说书人确认时，先弹窗询问提名者是否为镇民
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
        // 已经提名过：按普通提名继续
        addLog(`提示：${id+1}号【贞洁者】已在本局被提名过一次，她的能力已经失效。本次提名不会再立即处决提名者。`);
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
          addLog(`${sourceId+1}号 提名 ${id+1}号`);
          addLog(`${sourceId+1}号 提名贞洁者被处决`);
          const executedPlayer = finalSeats.find(s => s.id === sourceId);
          if (executedPlayer && executedPlayer.role?.id === 'saint' && !executedPlayer.isPoisoned) {
            setWinResult('evil');
            setWinReason('圣徒被处决');
            setGamePhase('gameOver');
            addLog("游戏结束：圣徒被处决，邪恶胜利");
            return;
          }
          if (checkGameOver(finalSeats, sourceId)) {
            return;
          }
          setShowExecutionResultModal({ message: `${sourceId+1}号玩家被处决`, isVirginTrigger: true });
          return;
        } else {
          setSeats(updatedSeats);
          // 不触发处决，继续普通提名
        }
      }
    }

    // 魔像特殊逻辑：如果提名的玩家不是恶魔，他死亡
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
          addLog("游戏结束：圣徒被处决，邪恶胜利");
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
    addLog(`${sourceId+1}号 提名 ${id+1}号`); 
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
        addLog(`${sourceId+1}号(精神病患者) 尝试再次使用日杀能力，但本局每名精神病患者只能日杀一次，当前已用完。`);
        setShowExecutionResultModal({ message: "精神病患者每局只能日杀一次，当前已用完。" });
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
      addLog(`精神病患者本局的日杀能力已经使用完毕，之后不能再发动。`);
    } else if(type==='slayer') {
      // 开枪可以在任意环节，但只有健康猎手选中恶魔才有效
      const shooter = seats.find(s => s.id === sourceId);
      if (!shooter || shooter.hasUsedSlayerAbility) return;
      // 死亡的猎手不能行动
      if (shooter.isDead) {
        addLog(`${sourceId+1}号 已死亡，无法开枪`);
        setShowShootResultModal({ message: "无事发生（射手已死亡）", isDemonDead: false });
        return;
      }
      
      const target = seats.find(s => s.id === id);
      if (!target) return;
      
      // 标记为已使用开枪能力
      setSeats(p => p.map(s => s.id === sourceId ? { ...s, hasUsedSlayerAbility: true } : s));
      
      // 对尸体开枪：能力被消耗，但无效果
      if (target.isDead) {
        addLog(`${sourceId+1}号 对 ${id+1}号的尸体开枪，未产生效果`);
        setShowShootResultModal({ message: "无事发生（目标已死亡）", isDemonDead: false });
        return;
      }
      
      // 只有健康状态的真正猎手选中恶魔才有效
      const isRealSlayer = shooter.role?.id === 'slayer' && !shooter.isPoisoned && !shooter.isDead;
      const targetRegistration = getRegistrationCached(target, shooter.role);
      const isDemon = targetRegistration.registersAsDemon;
      
      if (isRealSlayer && isDemon) {
        // 恶魔死亡，游戏立即结束
        setSeats(p => {
          const newSeats = p.map(s => s.id === id ? { ...s, isDead: true } : s);
          addLog(`${sourceId+1}号(猎手) 开枪击杀 ${id+1}号(小恶魔)`);
          addLog(`【猎手】的子弹击中了恶魔，按照规则，游戏立即结束，不再进行今天的处决和后续夜晚。`);
          // 先设置胜利原因，然后调用 checkGameOver 并保留 winReason
          setWinReason('猎手击杀恶魔');
          checkGameOver(newSeats, undefined, true);
          return newSeats;
        });
        // 显示弹窗：恶魔死亡
        setShowShootResultModal({ message: "恶魔死亡", isDemonDead: true });
      } else {
        addLog(`${sourceId+1}号${shooter.role?.id === 'slayer' ? '(猎手)' : ''} 开枪，但 ${id+1}号 不是恶魔或开枪者不是健康猎手`);
        // 显示弹窗：无事发生
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
    // 交互式日间能力：需要弹窗输入/确认
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

  const reviveSeat = useCallback((seat: Seat): Seat => {
    // 复活时清理所有临时负面状态与死而有能，只保留永久中毒等持续效果
    return cleanseSeatStatuses({
      ...seat,
      isEvilConverted: false,
      isZombuulTrulyDead: seat.isZombuulTrulyDead,
      hasGhostVote: true,
    });
  }, []);

  const submitVotes = (v: number) => {
    if(showVoteInputModal===null) return;
    
    // 验证票数：必须是自然数（>=1），且不超过开局时的玩家数
    const initialPlayerCount = initialSeats.length > 0 
      ? initialSeats.filter(s => s.role !== null).length 
      : seats.filter(s => s.role !== null).length;
    
    // 验证票数范围
    if (isNaN(v) || v < 1 || !Number.isInteger(v)) {
      alert(`票数必须是自然数（大于等于1的整数）`);
      return;
    }
    
    if (v > initialPlayerCount) {
      alert(`票数不能超过开局时的玩家数（${initialPlayerCount}人）`);
      return;
    }
    
    // 保存历史记录
    saveHistory();
    
    // 记录投票者是否为恶魔（用于卖花女孩）
    const voteRecord = voteRecords.find(r => r.voterId === showVoteInputModal);
    const isDemonVote = voteRecord?.isDemon || false;
    if (isDemonVote) {
      setTodayDemonVoted(true);
    }
    
    const alive = seats.filter(s=>!s.isDead).length;
    const threshold = Math.ceil(alive/2);
    // 票数达到50%才会上处决台
    setSeats(p=>p.map(s=>s.id===showVoteInputModal?{...s,voteCount:v,isCandidate:v>=threshold}:s));
    addLog(`${showVoteInputModal+1}号 获得 ${v} 票${v>=threshold ? ' (上台)' : ''}${isDemonVote ? '（恶魔投票）' : ''}`);
    setVoteInputValue('');
    setShowVoteErrorToast(false);
    setShowVoteInputModal(null);
  };

  const executeJudgment = () => {
    // 保存历史记录
    saveHistory();
    
    const cands = seats.filter(s=>s.isCandidate).sort((a,b)=>(b.voteCount||0)-(a.voteCount||0));
    if(cands.length===0) { 
      // 6. 弹窗公示处决结果
      setShowExecutionResultModal({ message: "无人上台，无人被处决" });
      return; 
    }
    const max = cands[0].voteCount || 0;
    const alive = seats.filter(s=>!s.isDead).length;
    const threshold = Math.ceil(alive/2);
    
    // 只有票数最高的才会被处决（即使有多人上台）
    const tops = cands.filter(c => c.voteCount === max && (c.voteCount || 0) >= threshold);
    if(tops.length>1) { 
      // 6. 弹窗公示处决结果
      setShowExecutionResultModal({ message: "平票，平安日，无人被处决" });
    } else if(tops.length === 1) {
      const executed = tops[0];
      // 茶艺师：若她存活且两侧邻居均为善良，则邻居不能被处决
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
          const msg = `由于【茶艺师】能力，${executed.id+1}号（茶艺师的善良邻居）本次处决无效，请重新计票或宣布平安日。`;
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
      setShowExecutionResultModal({ message: `最高票数 ${max} 未达到半数 ${threshold}，无人被处决` });
    }
  };
  
  // 6. 确认处决结果后继续游戏
  const confirmExecutionResult = () => {
    const isVirginTrigger = showExecutionResultModal?.isVirginTrigger;
    setShowExecutionResultModal(null);
    
    // 如果是贞洁者触发的处决，点击确认后自动进入下一个黑夜
    if (isVirginTrigger) {
      startNight(false);
      return;
    }
    
    const cands = seats.filter(s=>s.isCandidate).sort((a,b)=>(b.voteCount||0)-(a.voteCount||0));
    if(cands.length===0) {
      startNight(false);
      return;
    }
    const max = cands[0].voteCount || 0;
    const alive = seats.filter(s=>!s.isDead).length;
    const threshold = Math.ceil(alive/2);
    const tops = cands.filter(c => c.voteCount === max && (c.voteCount || 0) >= threshold);
    if(tops.length !== 1) {
      // 平票/无人处决 -> 若为涡流环境，邪恶立即胜利
      if (isVortoxWorld && todayExecutedId === null) {
        setWinResult('evil');
        setWinReason('涡流：白天无人处决');
        setGamePhase('gameOver');
        addLog('涡流在场且今日无人处决，邪恶阵营胜利');
        return;
      }
      startNight(false);
    }
  };

  const enterDuskPhase = useCallback(() => {
    // 保存历史记录
    saveHistory();
    // 进入新黄昏时，将当前黄昏的处决记录保存为"上一个黄昏的处决记录"
    // 这样送葬者在夜晚时就能看到上一个黄昏的处决信息
    if (currentDuskExecution !== null) {
      setLastDuskExecution(currentDuskExecution);
    } else {
      // 如果当前黄昏没有处决，保持上一个黄昏的记录（如果有的话）
      // 如果上一个黄昏也没有处决，lastDuskExecution保持为null
    }
    // 清空当前黄昏的处决记录，准备记录新的处决
    setCurrentDuskExecution(null);
    setGamePhase('dusk');
    // 重置所有提名状态，允许重新提名
    setSeats(p => p.map(s => ({...s, voteCount: undefined, isCandidate: false})));
    // 重置提名记录
    setNominationRecords({ nominators: new Set(), nominees: new Set() });
    setNominationMap({});
    setShowMayorThreeAliveModal(false);
  }, [currentDuskExecution]);

  const declareMayorImmediateWin = useCallback(() => {
    setShowMayorThreeAliveModal(false);
    setWinResult('good');
    setWinReason('3人存活且今日不处决（市长能力）');
    setGamePhase('gameOver');
    addLog('市长在场且剩余3人，今日选择不处决，好人胜利');
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

  const resolveLunaticRps = (didLunaticLose: boolean) => {
    if (!showLunaticRpsModal) return;
    const { targetId, nominatorId } = showLunaticRpsModal;
    const nominatorNote = nominatorId !== null ? `（提名者：${nominatorId+1}号）` : '';
    if (didLunaticLose) {
      addLog(`${targetId+1}号(精神病患者) 在石头剪刀布中落败${nominatorNote}，被处决`);
      executePlayer(targetId, { skipLunaticRps: true });
      setShowExecutionResultModal({ message: `${targetId+1}号被处决（石头剪刀布落败）` });
    } else {
      if (nominatorId !== null) {
        addLog(`${targetId+1}号(精神病患者) 在石头剪刀布中获胜或打平${nominatorNote}，提名者被处决`);
        const updatedSeats = seats.map(s => s.id === nominatorId ? { ...s, isDead: true, isSentenced: true } : s);
        setSeats(updatedSeats);
        checkGameOver(updatedSeats, nominatorId);
        setShowExecutionResultModal({ message: `${nominatorId+1}号被处决（因精神病患者猜拳获胜）` });
      } else {
        addLog(`${targetId+1}号(精神病患者) 在石头剪刀布中获胜或打平${nominatorNote}，处决取消`);
        setShowExecutionResultModal({ message: `${targetId+1}号存活（处决取消）` });
      }
      setSeats(p => p.map(s => ({ ...s, isCandidate: false, voteCount: undefined })));
      setNominationRecords({ nominators: new Set(), nominees: new Set() });
      setNominationMap({});
    }
    setShowLunaticRpsModal(null);
  };
  
  // 确认开枪结果后继续游戏
  const confirmShootResult = () => {
    setShowShootResultModal(null);
    // 如果恶魔死亡，游戏已经结束，不需要额外操作
    // 如果无事发生，继续游戏流程
  };

  const openContextMenuForSeat = (seatId: number, anchorMode: 'seat' | 'center' = 'seat') => {
    const containerRect = seatContainerRef.current?.getBoundingClientRect();
    const seatRect = seatRefs.current[seatId]?.getBoundingClientRect();
    // 触屏/竖屏需求：强制圆桌范围内居中显示
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
      const menuW = 192; // 12rem ≈ 192px
      const menuH = 240; // 预估高度，稍大以避免遮挡
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

  // 触屏长按处理：开始长按
  const handleTouchStart = (e: React.TouchEvent, seatId: number) => {
    e.stopPropagation();
    e.preventDefault();
    // 清除可能存在的旧定时器
    const existingTimer = longPressTimerRef.current.get(seatId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    // 添加长按状态，用于视觉反馈
    setLongPressingSeats(prev => new Set(prev).add(seatId));
    longPressTriggeredRef.current.delete(seatId);
    // 获取触摸位置
    const touch = e.touches[0];
    // 设置0.5秒后触发右键菜单/酒鬼伪装
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
    }, 500);
    longPressTimerRef.current.set(seatId, timer);
  };

  // 触屏长按处理：结束触摸（取消长按）
  const handleTouchEnd = (e: React.TouchEvent, seatId: number) => {
    e.stopPropagation();
    e.preventDefault();
    const timer = longPressTimerRef.current.get(seatId);
    if (timer) {
      clearTimeout(timer);
      longPressTimerRef.current.delete(seatId);
      // 若未触发长按，视为一次点击（用于触屏落座/选中）
      if (!longPressTriggeredRef.current.has(seatId)) {
        handleSeatClick(seatId);
      }
    }
    // 清除长按状态
    setLongPressingSeats(prev => {
      const next = new Set(prev);
      next.delete(seatId);
      return next;
    });
  };

  // 触屏长按处理：触摸移动（取消长按）
  const handleTouchMove = (e: React.TouchEvent, seatId: number) => {
    e.stopPropagation();
    e.preventDefault();
    const timer = longPressTimerRef.current.get(seatId);
    if (timer) {
      clearTimeout(timer);
      longPressTimerRef.current.delete(seatId);
    }
    // 清除长按状态
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
    }, 500);
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

  const insertIntoWakeQueueAfterCurrent = useCallback((seatId: number, opts?: { roleOverride?: Role | null; logLabel?: string }) => {
    if (!['night','firstNight'].includes(gamePhase)) return;
    let inserted = false;
    setWakeQueueIds(prev => {
      if (prev.includes(seatId)) return prev;
      const processed = prev.slice(0, currentWakeIndex + 1);
      if (processed.includes(seatId)) return prev;
      const seatsSnapshot = seatsRef.current || seats;
      const target = seatsSnapshot.find(s => s.id === seatId);
      const roleSource = opts?.roleOverride || (target?.role?.id === 'drunk' ? target.charadeRole || target?.role : target?.role);
      if (!roleSource) return prev;
      const order = gamePhase === 'firstNight' ? (roleSource.firstNightOrder ?? 0) : (roleSource.otherNightOrder ?? 0);
      if (order <= 0) return prev;
      // processed 已在上面声明（第4717行）
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
    }, [gamePhase, currentWakeIndex, seats, addLog]);

  // 将目标玩家转为邪恶阵营（灵言师关键词触发），保持原角色但计入邪恶胜负
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
    insertIntoWakeQueueAfterCurrent(targetId, { logLabel: `${targetId+1}号(转为邪恶)` });
  }, [insertIntoWakeQueueAfterCurrent]);

  const handleMenuAction = (action: string) => {
    if(!contextMenu) return;
    if(action==='nominate') { 
      // 只能在黄昏环节提名
      if (gamePhase !== 'dusk') {
        // 5. 屏蔽浏览器弹窗，使用控制台提示
        setContextMenu(null);
        return;
      }
      setShowDayActionModal({ type: 'nominate', sourceId: contextMenu.seatId });
    } else if(action==='slayer') {
      // 开枪可以在任意环节（除了setup阶段）
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
        
        // 如果尝试添加红罗刹但场上没有占卜师，则不允许
        if (!isRemoving && !hasFortuneTeller) {
          return p; // 不进行任何更改
        }
        
        // 场上"红罗刹"唯一：选择新的红罗刹时，清除其他玩家的红罗刹标记和图标
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
        
        // 只有在成功设置（而不是移除）红罗刹时才添加日志
        // 注意：这里使用setTimeout是为了在setSeats完成后再添加日志，避免在回调中直接调用
        if (!isRemoving) {
          setTimeout(() => {
            addLog(`你将 ${targetSeatId + 1} 号玩家设为本局唯一的【红罗刹】（占卜师永远视 ta 为邪恶）。`);
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
      // 8. 恶魔可以死在任意环节，当被标记死亡后，游戏立即结束
      if (type === 'dead') {
        // 立即检查游戏结束条件（包括存活人数和恶魔死亡）
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
    // 选择假身份后，在控制台显示假身份
    const targetId = showRavenkeeperFakeModal;
    if (targetId !== null && nightInfo) {
      const resultText = `${targetId+1}号玩家的真实身份是${r.name}${currentHint.isPoisoned || isVortoxWorld ? ' (中毒/醉酒状态，此为假消息)' : ''}`;
      setInspectionResult(resultText);
      setInspectionResultKey(k => k + 1);
      // 记录日志
      addLogWithDeduplication(
        `${nightInfo.seat.id+1}号(守鸦人) 查验 ${targetId+1}号 -> 伪造: ${r.name}`,
        nightInfo.seat.id,
        '守鸦人'
      );
    }
    setShowRavenkeeperFakeModal(null);
  };

  // 注意：此函数已不再使用，守鸦人的结果现在直接显示在控制台内
  // 保留此函数仅为了兼容性，但不会被调用
  const confirmRavenkeeperResult = () => {
    // 此函数已废弃，不再使用
    setShowRavenkeeperResultModal(null);
  };

  // 注意：此函数已不再使用，处女的逻辑现在在 handleDayAction 中直接处理
  // 保留此函数仅为了兼容性，但不会被调用
  const confirmVirginTrigger = () => {
    if (!showVirginTriggerModal) return;
    const { source, target } = showVirginTriggerModal;
    // 使用 hasBeenNominated 而不是 hasUsedVirginAbility
    if (target.role?.id === 'virgin' && !target.hasBeenNominated && !target.isPoisoned) {
      setSeats(p => {
        const newSeats = p.map(s => 
          s.id === source.id ? { ...s, isDead: true } : 
          s.id === target.id ? { ...s, hasBeenNominated: true, hasUsedVirginAbility: true } : s
        );
        addLog(`${source.id+1}号 提名贞洁者被处决`);
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
    // 如果游戏正在进行（不是scriptSelection阶段），先保存对局记录
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
        winResult: null, // 重开，无胜负结果
        winReason: "说书人重开了游戏",
        seats: JSON.parse(JSON.stringify(seats)), // 深拷贝座位信息
        gameLogs: updatedLogs // 包含重开日志的完整日志
      };
      
      saveGameRecord(record);
    }
    
    window.location.reload();
  };

  // 切换剧本：如果游戏正在进行，先结束游戏并保存记录
  const handleSwitchScript = () => {
    // 如果游戏正在进行（不是scriptSelection阶段），先结束游戏并保存记录
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
        winResult: null, // 说书人结束，无胜负结果
        winReason: "说书人结束了游戏",
        seats: JSON.parse(JSON.stringify(seats)), // 深拷贝座位信息
        gameLogs: updatedLogs // 包含结束日志的完整日志
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
    // 注意：这里不清空gameLogs，保留游戏记录，用户可以在复盘时查看
    setWinResult(null);
    setDeadThisNight([]);
    setPukkaPoisonQueue([]); // 清空普卡队列，防止旧局状态泄漏
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

  // 重置游戏到setup阶段（再来一局）
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

  // 9. 保存历史记录 - 改为普通函数，使用ref避免Hook依赖问题
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

  // 9.1 控制面板的"上一步"：只退回流程，不改变已生成的信息
  // 支持无限次后退，直到当前夜晚/阶段的开始
  const handleStepBack = () => {
    if (currentWakeIndex > 0) {
      setCurrentWakeIndex(currentWakeIndex - 1);
      // hint 会从缓存中恢复，不重新生成
    }
    // 如果已经是第一个，但还有历史记录，可以继续后退到上一个阶段
    else if (history.length > 0) {
      const lastState = history[history.length - 1];
      // 如果上一个状态是夜晚阶段，恢复并设置到最后一个唤醒索引
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
  
  // 9.2 全局上一步：撤销当前动作，清除缓存，重新生成信息
  // 支持无限次撤回，直到"选择剧本"页面
  const handleGlobalUndo = () => {
    // 如果在"选择剧本"页面，无效
    if (gamePhase === 'scriptSelection') {
      return;
    }
    
    if (history.length === 0) {
      // 如果历史记录为空，尝试回到"选择剧本"页面
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
    setSelectedScript(lastState.selectedScript); // 恢复选中的剧本
    
    // 清除 hint 缓存，让信息重新生成（符合"全局上一步"的需求）
    hintCacheRef.current.clear();
    
    // 不恢复 hint，让 useEffect 重新计算（这样信息会重新生成）
    
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
      {/* ===== 通用加载动画（不属于“暗流涌动”等具体剧本） ===== */}
      {showIntroLoading && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black">
          <div className="font-sans text-5xl md:text-7xl font-black tracking-[0.1em] text-red-400 animate-breath-shadow">
            拜甘教
          </div>
          <div className="mt-8 flex flex-col items-center gap-3">
            <div className="h-10 w-10 rounded-full border-4 border-red-500 border-t-transparent animate-spin" />
            <div className="text-base md:text-lg font-semibold text-red-200/90 font-sans tracking-widest">
              祈祷中 ···
            </div>
          </div>
        </div>
      )}
      {compositionError && (
        <div className="fixed inset-0 z-[9900] bg-black/70 flex items-center justify-center px-4">
          <div className="bg-gray-900 border-4 border-red-500 rounded-2xl p-6 max-w-xl w-full space-y-4 shadow-2xl">
            <div className="text-xl font-bold text-red-400">❌ 阵容配置错误</div>
            {compositionError.hasBaron ? (
              <div className="text-sm leading-6 text-gray-100 space-y-3">
                <p className="font-semibold text-yellow-300">
                  场上存在【男爵】。
                </p>
                <p>
                  {compositionError.playerCount} 人局时，外来者应为 <span className="font-bold text-yellow-200">{compositionError.standard.outsider} 人</span>
                  {(() => {
                    // 从标准配置表中查找基础配置（无男爵时的配置）
                    const basePreset = troubleBrewingPresets.find(p => p.total === compositionError.playerCount);
                    const baseOutsider = basePreset?.outsider ?? 0;
                    return `（而不是 ${baseOutsider}）`;
                  })()}。
                </p>
                <p className="font-semibold text-yellow-200">
                  请增加 2 名外来者（从镇民中替换），或者移除男爵后再开始游戏。
                </p>
                <div className="text-sm text-gray-300 space-y-2 bg-gray-800/60 rounded-lg p-3 border border-gray-700 mt-3">
                  <div className="font-semibold mb-1">当前配置：</div>
                  <div>
                    {compositionError.actual.townsfolk} 镇民 / {compositionError.actual.outsider} 外来者 / {compositionError.actual.minion} 爪牙 / {compositionError.actual.demon} 恶魔
                  </div>
                  <div className="font-semibold mt-2 mb-1">标准配置应为（含男爵）：</div>
                  <div>
                    {compositionError.standard.townsfolk} 镇民 / {compositionError.standard.outsider} 外来者 / {compositionError.standard.minion} 爪牙 / {compositionError.standard.demon} 恶魔
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm leading-6 text-gray-100 space-y-3">
                <p>
                  当前为 <span className="font-bold text-white">{compositionError.playerCount} 人局</span>，标准配置应为
                  <span className="font-semibold text-yellow-200">
                    【{compositionError.standard.townsfolk} 镇民 / {compositionError.standard.outsider} 外来者 / {compositionError.standard.minion} 爪牙 / {compositionError.standard.demon} 恶魔】
                  </span>。
                </p>
                <p>
                  你现在的配置是
                  <span className="font-semibold text-red-300">
                    【{compositionError.actual.townsfolk} 镇民 / {compositionError.actual.outsider} 外来者 / {compositionError.actual.minion} 爪牙 / {compositionError.actual.demon} 恶魔】
                  </span>。
                </p>
                <p className="text-sm text-gray-300 font-semibold">
                  请调整角色数量后再点击开始游戏。
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  // 在重置前安全地打印当前错误信息，避免 compositionError 为 null 时输出 {}
                  setCompositionError(prev => {
                    if (prev) {
                      // 使用 console.warn 避免被 Next/React 视为“错误”而弹出 Error Overlay
                      console.warn('阵容配置错误：', {
                        当前配置: prev.actual,
                        标准配置: prev.standard,
                        人数: prev.playerCount,
                        有男爵: prev.hasBaron,
                      });
                    } else {
                      console.error('阵容配置错误：状态已重置，无法获取详细信息');
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
            <div className="text-xl font-bold text-yellow-300">⚠️ Setup 校验</div>
            <p className="text-sm leading-6 text-gray-100">
              检测到你选择了【男爵 (Baron)】，但当前【镇民/外来者】数量不符规则。
            </p>
            <div className="text-sm text-gray-200 space-y-2 bg-gray-800/60 rounded-lg p-3 border border-gray-700">
              <div>当前：{baronSetupCheck.current.townsfolk} 个镇民、{baronSetupCheck.current.outsider} 个外来者</div>
              <div className="font-semibold text-yellow-200">
                建议调整为：{baronSetupCheck.recommended.townsfolk} 个镇民、{baronSetupCheck.recommended.outsider} 个外来者
              </div>
              <div className="text-xs text-gray-400">
                （共 {baronSetupCheck.recommended.total} 人局，含男爵自动将 2 名镇民替换为 2 名外来者）
              </div>
            </div>
            <p className="text-sm text-gray-300">
              你可以点击【自动重排】由系统重新分配，点击【我手动调整】后再继续，或在说书人裁量下点击【保持当前配置】直接开始游戏。
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
                我手动调整
              </button>
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
      {/* ===== 暗流涌动剧本（游戏第一部分）主界面 ===== */}
      <GameStage>
        {/* 使用 Flex 布局，填满 1600x800 */}
        <div className="w-full h-full flex flex-col bg-slate-950 text-white">
          
          {/* 区域 1: 顶部栏 */}
          <header className="flex items-center justify-between px-4 h-16 border-b border-white/10 bg-slate-900/50 z-20 shrink-0">
            <span className="font-bold text-purple-400 text-xl flex items-center justify-center h-8 flex-shrink-0">控制台</span>
            <div className="flex items-center flex-shrink-0 gap-1">
              <button 
                onClick={()=>setShowGameRecordsModal(true)} 
                className="px-2 py-1 text-sm h-8 bg-green-600 border rounded shadow-lg flex items-center justify-center flex-shrink-0"
              >
                对局记录
              </button>
              <button 
                onClick={()=>setShowReviewModal(true)} 
                className="px-2 py-1 text-sm h-8 bg-indigo-600 border rounded shadow-lg flex items-center justify-center flex-shrink-0"
              >
                复盘
              </button>
              <div className="relative flex-shrink-0">
                <button 
                  onClick={(e)=>{e.stopPropagation();setShowMenu(!showMenu)}} 
                  className="px-2 py-1 text-sm h-8 bg-gray-800 border rounded shadow-lg flex items-center justify-center"
                >
                  ☰
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-gray-800 border rounded-lg shadow-xl z-[1000]">
                    <button 
                      onClick={()=>{setShowRoleInfoModal(true);setShowMenu(false)}} 
                      className="w-full p-4 text-left text-blue-400 hover:bg-gray-700 border-b border-gray-700"
                    >
                      📖 角色信息
                    </button>
                    <button 
                      onClick={()=>{handleSwitchScript();setShowMenu(false)}} 
                      className="w-full p-4 text-left text-purple-400 hover:bg-gray-700 border-b border-gray-700"
                    >
                      🔀 切换剧本
                    </button>
                    <button 
                      onClick={handleRestart} 
                      className="w-full p-4 text-left text-red-400 hover:bg-gray-700"
                    >
                      🔄 重开
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* 主内容区域：左右布局 */}
          <div className="flex-1 flex min-h-0">
            {/* === 左侧：圆桌区域 (自适应宽度，高度填满) === */}
            <main className="flex-1 h-full relative flex items-center justify-center overflow-hidden p-4">
              {/* 全屏氛围层 (保持不变) */}
              <div className="absolute inset-0 shadow-[inset_0_0_200px_100px_rgba(0,0,0,0.8)] z-0 pointer-events-none" />
              
              {/* 万能上一步按钮和伪装身份识别按钮 */}
              {gamePhase !== 'scriptSelection' && (
                <div className="absolute top-4 right-4 z-50 flex flex-col gap-2">
                  <button
                    onClick={handleGlobalUndo}
                    className="px-4 py-2 text-sm bg-blue-600 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-colors"
                  >
                    <div className="flex flex-col items-center">
                      <div>⬅️ 万能上一步</div>
                      <div className="text-xs font-normal opacity-80">（撤销当前动作）</div>
                    </div>
                  </button>
                  <button
                    onClick={() => setShowSpyDisguiseModal(true)}
                    className="px-4 py-2 text-sm bg-purple-600 rounded-xl font-bold shadow-lg hover:bg-purple-700 transition-colors"
                  >
                    <div className="flex items-center justify-center">
                      <div>🎭 伪装身份识别</div>
                    </div>
                  </button>
                </div>
              )}
              
              {/* === 核心修改：圆桌容器 === */}
              <div 
                ref={seatContainerRef}
                className="relative h-full max-h-[90%] aspect-square flex items-center justify-center z-10"
              >
                {/* 中心文字 */}
                <div className="absolute inset-0 flex flex-col items-center justify-center z-0 pointer-events-none select-none">
                  <div className="text-6xl font-black tracking-wider bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]">
                    {phaseNames[gamePhase]}
                  </div>
                  <div className="text-sm text-slate-400/60 uppercase tracking-[0.3em] font-medium mt-4">
                    design by{" "}
                    <span className="font-bold italic">Bai  Gan Group</span>
                  </div>
                  {gamePhase==='scriptSelection' && (
                    <div className="text-5xl font-mono font-bold text-cyan-300 drop-shadow-[0_0_15px_rgba(34,211,238,0.6)] mt-4">
                      请选择剧本
                    </div>
                  )}
                  {gamePhase!=='setup' && gamePhase!=='scriptSelection' && (
                    <div className="text-5xl font-mono font-bold text-cyan-300 drop-shadow-[0_0_15px_rgba(34,211,238,0.6)] mt-4">
                      {formatTimer(timer)}
                    </div>
                  )}
                </div>

                {/* 座位循环 - 使用百分比定位 */}
                {seats.map((s, i) => {
                  // 计算座位在圆上的位置（使用百分比）
                  // 15人圆桌：使用40%半径，确保座位均匀分布且不重叠
                  const radiusPercent = 40; // 40% 的半径，适合15人圆桌
                  const angle = (i / seats.length) * 2 * Math.PI - Math.PI / 2; // -90度开始(12点钟方向)
                  const xPercent = 50 + radiusPercent * Math.cos(angle); // 中心点50% + 偏移
                  const yPercent = 50 + radiusPercent * Math.sin(angle); // 中心点50% + 偏移
                  
                  return (
                    <div
                      key={s.id}
                      className="absolute"
                      style={{
                        left: `${xPercent}%`,
                        top: `${yPercent}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      <SeatNode
                        seat={s}
                        index={i}
                        seats={seats}
                        isPortrait={isPortrait}
                        seatScale={seatScale}
                        nightInfo={nightInfo}
                        selectedActionTargets={selectedActionTargets}
                        longPressingSeats={longPressingSeats}
                        onSeatClick={handleSeatClick}
                        onContextMenu={handleContextMenu}
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                        onTouchMove={handleTouchMove}
                        setSeatRef={(id, el) => { seatRefs.current[id] = el; }}
                        getSeatPosition={getSeatPosition}
                        getDisplayRoleType={getDisplayRoleType}
                        typeColors={typeColors}
                      />
                    </div>
                  );
                })}
              </div>
            </main>

            {/* === 右侧：侧边栏 (固定宽度) === */}
            <aside className="w-[450px] h-full border-l border-white/10 bg-slate-900/50 flex flex-col relative z-20 shrink-0 overflow-hidden">
            <div className="px-4 py-2 border-b border-white/10 shrink-0 h-16 flex items-center">
              <h2 className="text-lg font-bold text-purple-300">📖 说书人控制台</h2>
            </div>
            {nightInfo && (
              <div className="px-4 py-2 border-b border-white/10 bg-slate-900/50 shrink-0">
                <span 
                  ref={currentActionTextRef}
                  className="text-sm font-bold text-white block text-center"
                >
                  当前是第{currentNightNumber}夜：轮到
                  <span className="text-yellow-300">
                    {nightInfo.seat.id+1}号{currentWakeRole?.name || nightInfo.effectiveRole.name}
                  </span>
                  行动。
                  <br />
                  下一个将是
                  <span className="text-cyan-300">
                    {nextWakeSeat && nextWakeRole ? `${nextWakeSeat.id+1}号${nextWakeRole.name}` : '（本夜结束）'}
                  </span>
                  。
                </span>
              </div>
            )}
            <div ref={consoleContentRef} className="flex-1 overflow-y-auto p-4 text-sm min-h-0">
          {/* 剧本选择页面 */}
          {gamePhase==='scriptSelection' && (
            <div className="flex flex-col items-center justify-center min-h-full">
              <h2 className="text-4xl font-bold mb-2 text-white">选择剧本</h2>
              <p className="text-gray-400 italic mb-8">更多剧本开发中…</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
                {scripts.map(script => (
                  <button
                    key={script.id}
                    onClick={() => {
                      // 保存选择剧本前的状态到历史记录
                      saveHistory();
                      setSelectedScript(script);
                      setGameLogs([]); // 选择新剧本时清空之前的游戏记录
                      setGamePhase('setup');
                    }}
                    className="p-8 bg-gray-800 border-4 border-gray-600 rounded-2xl hover:border-blue-500 hover:bg-gray-700 transition-all text-center flex flex-col items-center justify-center"
                  >
                    <div className="text-2xl font-bold text-white mb-2">{script.name}</div>
                    <div className="text-sm text-gray-400">难度：{script.difficulty}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* 4. 白天控制台增加说书人提示 */}
          {gamePhase==='day' && (
            <div className="mb-4 p-3 bg-gray-800/50 border border-yellow-500/30 rounded-lg text-sm text-gray-300 leading-relaxed">
              <p className="mb-2 font-bold text-yellow-400 text-sm">📖 说书人提示</p>
              <p className="mb-2 text-xs">你的目标是主持一场有趣好玩且参与度高的游戏。</p>
              <p className="mb-2 text-xs">有些事你可以做，但不意味着你应该去做。你是否只顾自己取乐而给玩家们添乱？你是否正在牺牲玩家的乐趣来放纵自己？比如说当小恶魔在夜里将自己杀死时，你"可以"将陌客当作是爪牙并让他因此变成一个善良的小恶魔，但这并不意味着这样做是有趣或平衡的。比如说你"可以"说服一名迷惑的善良阵营玩家，告诉他他是邪恶阵营的，但这并不意味着玩家在得知真相后会享受这个过程。又比如说你"可以"给博学者提供完全没用的信息，但显然提供有趣且独特的信息会更好。</p>
              <p className="mb-2 text-xs">作为说书人，你在每一局游戏当中都需要做出很多有趣的决定。而这每一个决定的目的都应该是使游戏变得更好玩，为大家带来更多乐趣。这通常意味着你需要给善良阵营制造尽可能多的混乱，将他们引入歧途，因为这对所有人来说都是有趣的。但请牢记在心，维持游戏的公平性是同样重要的，你主持游戏是为了让玩家都能够享受到游戏中的精彩。</p>
                      </div>
          )}
          {gamePhase==='day' && (() => {
            const dayAbilityConfigs: DayAbilityConfig[] = [
              {
                roleId: 'savant_mr',
                title: '博学者每日提问',
                description: '每个白天一次，向说书人索取一真一假的两条信息。',
                usage: 'daily',
                logMessage: seat => `${seat.id+1}号(博学者) 使用今日提问，请准备一真一假两条信息`
              },
              {
                roleId: 'amnesiac',
                title: '失意者每日猜测',
                description: '每个白天一次，向说书人提交本回合的猜测并获得反馈。',
                usage: 'daily',
                logMessage: seat => `${seat.id+1}号(失意者) 提交今日猜测，请给出反馈`
              },
              {
                roleId: 'fisherman',
                title: '渔夫灵感',
                description: '每局一次，向说书人索取获胜建议。',
                usage: 'once',
                logMessage: seat => `${seat.id+1}号(渔夫) 使用一次性灵感，请提供获胜建议`
              },
              {
                roleId: 'engineer',
                title: '工程师改装',
                description: '每局一次，改造恶魔或爪牙阵营（请手动选择变更）。',
                usage: 'once',
                logMessage: seat => `${seat.id+1}号(工程师) 启动改装，请根据需求手动调整恶魔/爪牙`
              },
              {
                roleId: 'lunatic_mr',
                title: '精神病患者日杀',
                description: '提名前公开杀死一名玩家。处决时需与提名者猜拳决定生死。',
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
                  <p className="text-sm font-bold text-blue-300">🌞 白天主动技能</p>
                  <span className="text-xs text-gray-400">每日/一次性能力快速触发</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {entries.map(({ seat, config }) => {
                    const used = config.usage === 'once'
                      ? hasUsedAbility(config.roleId, seat.id)
                      : hasUsedDailyAbility(config.roleId, seat.id);
                    const disabled = seat.isDead || used;
                    const statusLabel = seat.isDead
                      ? '已死亡'
                      : used
                        ? (config.usage === 'once' ? '已用完' : '今日已用')
                        : '可使用';
                    return (
                      <div key={`${config.roleId}-${seat.id}`} className="p-3 border border-gray-700 rounded-lg bg-gray-900/40">
                        <div className="flex items-center justify-between mb-1">
                          <div className="font-bold text-white">{seat.id+1}号 {seat.role?.name}</div>
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
                          {l.id+1}号 {getSeatRoleId(seats.find(s=>s.id===l.id)) === l.roleId ? '' : ''}{roles.find(r=>r.id===l.roleId)?.name || l.roleId}：{l.text}
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
                <p className="text-sm font-bold text-pink-300">👸 爪牙猜测落难少女</p>
                <span className="text-xs text-gray-400">每名爪牙每局一次，猜中则邪恶立刻获胜</span>
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
                <p className="text-sm font-bold text-purple-300">🔮 灵言师关键词已被说出</p>
                <span className="text-xs text-gray-400">选择第一个说出关键词的善良玩家</span>
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
            // 计算各阵营数量
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
            // 血染钟楼规则：
            // - 外来者数 = floor(总玩家数 / 3) + 修正值
            // - 爪牙数 = floor((总玩家数 - 3) / 2)
            // - 恶魔数 = 1
            // - 总玩家数 = 村民数 + 外来者数 + 爪牙数 + 恶魔数
            
            const calculateRecommendations = (townsfolkCount: number) => {
            const recommendations: Array<{
              outsider: number;
              minion: number;
              demon: number;
              total: number;
              modifiers: string[];
              note?: string;
            }> = [];

            // 以村民数为基准的官方建议表
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
                  note: `总人数${p.total}人`,
                });
              });

            recommendations.sort((a, b) => a.total - b.total);

            return recommendations.slice(0, 5); // 最多显示5个建议
            };
            
            const recommendations = calculateRecommendations(actualTownsfolkCount);
            
            // 检查当前配置是否匹配某个建议
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
                    <div className="font-bold mb-2">📊 阵营角色数量建议</div>
                    <div className="text-sm space-y-1">
                      <div>当前村民数：{actualTownsfolkCount}人（保持不变）</div>
                      <div className="mt-2 font-semibold">建议配置：</div>
                      {recommendations.length > 0 ? (
                        <div className="space-y-1 ml-2">
                          {recommendations.map((rec, idx) => {
                            const isCurrent = rec.outsider === actualOutsiderCount && 
                                            rec.minion === actualMinionCount && 
                                            rec.demon === actualDemonCount;
                            return (
                              <div key={idx} className={isCurrent ? 'text-green-300 font-bold' : ''}>
                                {rec.outsider}外来者、{rec.minion}爪牙、{rec.demon}恶魔
                                {rec.note && <span className="text-xs opacity-75 ml-1">（{rec.note}）</span>}
                                {isCurrent && <span className="ml-2">✓ 当前配置</span>}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-xs opacity-75 ml-2">无有效配置</div>
                      )}
                      <div className="mt-2 text-xs opacity-75">
                        实际：{actualOutsiderCount}外来者、{actualMinionCount}爪牙、{actualDemonCount}恶魔
                      </div>
                      {!isValid && (
                        <div className="mt-2 text-yellow-300 font-bold">⚠️ 当前配置不在建议范围内！</div>
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
                              isTaken?'opacity-30 cursor-not-allowed bg-gray-800':'' 
                            } ${typeBgColors[r.type]} ${
                              selectedRole?.id===r.id?'ring-4 ring-white scale-105':''
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
                  🎭 红罗刹自动分配：{autoRedHerringInfo}
                </div>
              )}
              {selectedScript && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-gray-800/80 border border-yellow-500/70 text-left text-sm text-gray-100 space-y-1">
                  <div className="font-bold text-yellow-300 mb-1">🌙 夜晚行动说明（{selectedScript.name}）</div>
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
                            ：{list.map(r => r.name).join('、')}
                          </span>
                        </div>
                      );
                    };
                    return (
                      <>
                        {renderLine('只在首夜被唤醒的角色', onlyFirst)}
                        {renderLine('只在之后夜晚被唤醒的角色', onlyOther)}
                        {renderLine('首夜和之后夜晚都会被唤醒的角色', bothNights)}
                        {renderLine('从不在夜里被唤醒、但始终生效的角色', passive)}
                      </>
                    );
                  })()}
                  <div className="text-xs text-gray-400 mt-1">
                    提示：若某角色今晚未被叫醒，通常是因为规则只在首夜或之后夜晚才叫醒，而非程序漏掉。
                  </div>
                </div>
              )}
              <div className="bg-gray-800 p-4 rounded-xl text-left text-base space-y-3 max-h-[80vh] overflow-y-auto check-identity-scrollbar">
                {seats.filter(s=>s.role).map(s=>{
                  // 酒鬼应该显示伪装角色的名称，而不是"酒鬼"
                  const displayRole = s.role?.id === 'drunk' && s.charadeRole ? s.charadeRole : s.role;
                  const displayName = displayRole?.name || '';
                  const canRedHerring = canToggleRedHerring(s.id);
                  return (
                    <div 
                      key={s.id} 
                      className="flex flex-col gap-1 border-b border-gray-700 pb-2 select-none"
                      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
                      onContextMenu={(e)=>handleCheckContextMenu(e, s.id)}
                      onTouchStart={(e)=>handleCheckTouchStart(e, s.id)}
                      onTouchEnd={(e)=>handleCheckTouchEnd(e, s.id)}
                      onTouchMove={(e)=>handleCheckTouchMove(e, s.id)}
                    >
                      <div className="flex justify-between">
                        <span>{s.id+1}号</span>
                        <span className={s.role?.type==='demon'?'text-red-500 font-bold':''}>
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
                            title="死者票：点击切换已用/未用"
                          >
                            死者票{(s.hasGhostVote === false) ? '（已用）' : ''}
                          </button>
                        )}
                        {s.hasUsedSlayerAbility && (
                          <span className="px-2 py-0.5 rounded bg-red-900/60 text-red-200 border border-red-700">猎手已用</span>
                        )}
                        {s.hasUsedVirginAbility && (
                          <span className="px-2 py-0.5 rounded bg-purple-900/60 text-purple-200 border border-purple-700">处女已失效</span>
                        )}
                        {s.hasAbilityEvenDead && (
                          <span className="px-2 py-0.5 rounded bg-green-900/60 text-green-200 border border-green-700">死而有能</span>
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
                <div className="text-xl font-bold text-purple-300 mb-4">👿 爪牙集体的行动</div>
                <div className="mb-2 text-sm text-gray-400 font-bold uppercase">📖 指引：</div>
                <p className="text-base mb-4 leading-relaxed whitespace-pre-wrap font-medium">
                  现在请同时唤醒{minionSeatsText}爪牙，告诉他们恶魔是{showMinionKnowDemonModal.demonSeatId + 1}号玩家。
                </p>
                <div className="text-sm text-gray-200 space-y-2 bg-gray-800/60 rounded-lg p-3 border border-gray-700 mb-4">
                  <div className="font-semibold text-purple-300 mb-2">恶魔位置：</div>
                  <div className="text-lg font-bold text-yellow-300">
                    {showMinionKnowDemonModal.demonSeatId + 1}号玩家是恶魔
                  </div>
                </div>
                <div className="mb-2 text-sm text-yellow-400 font-bold uppercase">🗣️ 台词：</div>
                <p className="text-lg font-serif bg-black/40 p-3 rounded-xl border-l-4 border-yellow-500 italic text-yellow-100">
                  "现在请你一次性叫醒所有爪牙，并指向恶魔。恶魔在 {showMinionKnowDemonModal.demonSeatId + 1} 号。确认所有爪牙都知道恶魔的座位号后，再让他们一起闭眼。"
                </p>
                <div className="mt-6">
                  <button
                    onClick={() => {
                      setShowMinionKnowDemonModal(null);
                      // 先移动到下一个行动，然后继续
                      if(currentWakeIndex < wakeQueueIds.length - 1) { 
                        setCurrentWakeIndex(p => p + 1); 
                        setInspectionResult(null);
                        setSelectedActionTargets([]);
                        fakeInspectionResultRef.current = null;
                      } else {
                        // 夜晚结束，显示死亡报告
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
                    已告知，继续
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
                    ⚠️ {currentHint.reason}
                  </div>
                )}
                <div className="mb-2 text-sm text-gray-400 font-bold uppercase">📖 指引：</div>
                <p className="text-base mb-4 leading-relaxed whitespace-pre-wrap font-medium">{currentHint.guide}</p>
                <div className="mb-2 text-sm text-yellow-400 font-bold uppercase">🗣️ 台词：</div>
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
                        <span>{s.id+1}号</span>
                        <span className={s.role?.type==='demon'?'text-red-500':''}>
                          {s.role?.name}
                        </span>
    </div>
                    ))}
                  </div>
                  <div className="w-1/2">
                    <h4 className="text-yellow-400 mb-2 font-bold border-b pb-1 text-sm">行动日志</h4>
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {/* 5. 按天数分开显示日志 */}
                      {(() => {
                        const logsByDay = gameLogs.reduce((acc, log) => {
                          const dayKey = log.day;
                          if (!acc[dayKey]) acc[dayKey] = [];
                          acc[dayKey].push(log);
                          return acc;
                        }, {} as Record<number, LogEntry[]>);
                        
                        return Object.entries(logsByDay).reverse().map(([day, logs]) => (
                          <div key={day} className="mb-2">
                            <div className="text-yellow-300 font-bold mb-1 text-xs">
                              {logs[0]?.phase === 'firstNight' ? '第1夜' : 
                               logs[0]?.phase === 'night' ? `第${day}夜` :
                               logs[0]?.phase === 'day' ? `第${day}天` :
                               logs[0]?.phase === 'dusk' ? `第${day}天黄昏` : `第${day}轮`}
                            </div>
                            {logs.reverse().map((l, i) => (
                              <div key={i} className="py-1 border-b border-gray-700 text-gray-300 text-xs pl-2">
                                {l.message}
                              </div>
                            ))}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              )}
              
              {/* 7. 修复小恶魔选择问题 - 确保小恶魔在非首夜可以显示选择按钮 */}
              {nightInfo.effectiveRole.nightActionType!=='spy_info' && nightInfo.effectiveRole.nightActionType!=='none' && (
                <div className="grid grid-cols-3 gap-3 mt-4">
                  {seats.filter(s=>{
                    // 占卜师可以选择任意2名玩家（包括自己和已死亡玩家）
                    if (nightInfo.effectiveRole.id === 'fortune_teller') {
                      return s.role !== null; // 只要有角色就可以选择
                    }
                    // 小恶魔在非首夜可以选择任意活着的玩家
                    if (nightInfo.effectiveRole.id === 'imp' && gamePhase !== 'firstNight') {
                      return s.role && !s.isDead;
                    }
                    // 僵怖可以选择任意活着的玩家（包括假死状态的僵怖自己）
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
                        selectedActionTargets.includes(s.id)?
                          'bg-green-600 border-white scale-105 shadow-lg ring-4 ring-green-500':
                          'bg-gray-700 border-gray-600 hover:bg-gray-600'
                      } ${isTargetDisabled(s)?'opacity-30 cursor-not-allowed':''}`}
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
              <h3 className="text-lg font-bold mb-2 text-orange-400">⚖️ 处决台</h3>
              {seats.filter(s=>s.isCandidate).sort((a,b)=>(b.voteCount||0)-(a.voteCount||0)).map((s,i)=>(
                <div 
                  key={s.id} 
                  className={`flex justify-between p-2 border-b border-gray-600 ${
                    i===0?'text-red-400 font-bold':''
                  }`}
                >
                  <span>{s.id+1}号 {s.role?.name}</span>
                  <span>{s.voteCount}票</span>
                </div>
              ))}
            </div>
          )}
            </div>
          </aside>

          </div>
          
          {/* 区域 4: 底部控制栏 */}
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
              onStartNight={startNight}
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
      {showNightOrderModal && (
        <ModalWrapper
          title={nightQueuePreviewTitle || '🌙 今晚要唤醒的顺序列表'}
          onClose={closeNightOrderPreview}
          className="max-w-4xl border-4 border-yellow-500"
          closeOnOverlayClick={true}
          footer={
            <>
              <button
                onClick={closeNightOrderPreview}
                className="px-6 py-3 rounded-xl bg-gray-700 text-gray-100 font-bold hover:bg-gray-600 transition"
              >
                返回调整
              </button>
              <button
                onClick={confirmNightOrderPreview}
                className="px-6 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-500 transition"
              >
                确认无误，入夜
              </button>
            </>
          }
        >
          <p className="text-sm text-gray-200 text-center mb-4">
            请核对今晚要叫醒的所有角色顺序。你可以点击"返回调整"继续修改座位/身份，或点击"确认"正式进入夜晚流程。
          </p>
          <div className="grid grid-cols-1 gap-3">
            {nightOrderPreview.map((item, idx) => (
              <div key={`${item.roleName}-${item.seatNo}-${idx}`} className="p-3 rounded-xl border border-gray-700 bg-gray-800/80 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm text-gray-400">顺位 {item.order || '—'}</span>
                  <span className="text-base font-bold text-white">[{item.seatNo}号] {item.roleName}</span>
                </div>
                <span className="text-xs text-gray-500">第{idx + 1} 唤醒</span>
              </div>
            ))}
          </div>
        </ModalWrapper>
      )}
      <MayorThreeAliveModal
        isOpen={showMayorThreeAliveModal}
        onContinue={() => {
          setShowMayorThreeAliveModal(false);
          enterDuskPhase();
        }}
        onDeclareWin={declareMayorImmediateWin}
        onCancel={() => setShowMayorThreeAliveModal(false)}
      />
      {showDrunkModal!==null && (
        <div className="fixed inset-0 z-[3000] bg-black/95 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl w-[800px] max-w-[95vw] border-2 border-yellow-500">
            <h2 className="mb-3 text-center text-3xl text-yellow-400">🍺 酒鬼伪装向导</h2>
            <div className="space-y-2 text-sm text-gray-200 mb-4">
              <p>请选择一张【镇民】卡作为酒鬼的伪装。选定后系统会自动记录为 charadeRole。</p>
              <p className="text-yellow-300">给玩家看的台词：请把「所选镇民卡」给该玩家看，并说“你是 {`<所选镇民>`}”。</p>
              <p className="text-gray-300">实际身份仍为【酒鬼】，后续信息系统会按中毒/酒鬼规则处理。</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto">
              {(filteredGroupedRoles['townsfolk'] || []).map(r=>{
                const isTaken = seats.some(s => s.role?.id === r.id);
                return (
                  <button 
                    key={r.id}
                    type="button"
                    disabled={isTaken}
                    onClick={()=>!isTaken && confirmDrunkCharade(r)} 
                    className={`p-3 border-2 rounded-xl text-base font-bold text-left ${
                      isTaken
                        ? 'border-gray-700 bg-gray-900/70 text-gray-500 cursor-not-allowed opacity-60'
                        : 'border-blue-500 bg-gray-900 hover:bg-blue-900 cursor-pointer'
                    }`}
                    title={isTaken ? '该角色已在本局中出现，不能作为酒鬼伪装' : ''}
                  >
                    <div className="flex flex-col">
                      <span>{r.name}</span>
                      {isTaken && (
                        <span className="text-xs text-gray-500 mt-1">
                          （该角色已在场上，规则：酒鬼不得伪装为已存在角色）
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end">
              <button 
                onClick={()=>setShowDrunkModal(null)}
                className="px-4 py-2 bg-gray-700 rounded-lg font-bold"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showVoteInputModal!==null && (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl text-center border-2 border-blue-500 relative">
            <h3 className="text-3xl font-bold mb-4">🗳️ 输入票数</h3>
            <div className="mb-6 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg text-sm text-yellow-200">
              <p className="font-semibold">注意：请自行确保每名死亡玩家在本局只使用一次"死人票"。本工具不会替你追踪死人票次数。</p>
              {(() => {
                const ghostHolders = seats
                  .filter(s => s.isDead && s.hasGhostVote !== false)
                  .map(s => `${s.id + 1}号`);
                return (
                  <div className="mt-2 text-xs text-yellow-100">
                    场上仍有死者票的玩家：{ghostHolders.length ? ghostHolders.join('、') : '无'}
                  </div>
                );
              })()}
            </div>
            <div className="mb-6">
              <input 
                autoFocus 
                type="number" 
                min="1"
                max={initialSeats.length > 0 
                  ? initialSeats.filter(s => s.role !== null).length 
                  : seats.filter(s => s.role !== null).length}
                step="1"
                value={voteInputValue}
                className="w-full p-4 bg-gray-700 rounded-xl text-center text-4xl font-mono" 
                onChange={(e) => {
                const value = e.target.value;
                const initialPlayerCount = initialSeats.length > 0 
                  ? initialSeats.filter(s => s.role !== null).length 
                  : seats.filter(s => s.role !== null).length;
                
                // 如果输入为空，允许继续输入
                if (value === '') {
                  setVoteInputValue('');
                  return;
                }
                
                  const numValue = parseInt(value);
                  // 检查是否符合要求：必须是有效数字，且不超过开局时的玩家数
                  if (isNaN(numValue) || numValue < 1 || !Number.isInteger(numValue) || numValue > initialPlayerCount) {
                    // 不符合要求，清空输入并显示浮窗
                    setVoteInputValue('');
                    setShowVoteErrorToast(true);
                    // 3秒后自动消失
                    setTimeout(() => {
                      setShowVoteErrorToast(false);
                    }, 3000);
                  } else {
                    // 符合要求，更新输入值
                    setVoteInputValue(value);
                  }
                }}
                onKeyDown={(e)=>{if(e.key==='Enter')submitVotes(parseInt(voteInputValue)||0)}} 
              />
              {showVoteErrorToast && (
                <div 
                  className="mt-2 bg-red-600/30 text-white text-sm px-4 py-2 rounded-lg shadow-lg"
                >
                  票数不得超过开局时的玩家数
                </div>
              )}
            </div>
            <div className="mb-4">
              <label className="flex items-center gap-2 text-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={voteRecords.some(r => r.voterId === showVoteInputModal && r.isDemon)}
                  onChange={(e) => {
                    const isDemon = e.target.checked;
                    setVoteRecords(prev => {
                      const filtered = prev.filter(r => r.voterId !== showVoteInputModal);
                      const newRecords = [...filtered, { voterId: showVoteInputModal, isDemon }];
                      // 更新 todayDemonVoted 状态
                      if (isDemon) {
                        setTodayDemonVoted(true);
                      } else {
                        // 检查是否还有其他恶魔投票
                        const hasOtherDemonVote = filtered.some(r => r.isDemon);
                        setTodayDemonVoted(hasOtherDemonVote);
                      }
                      return newRecords;
                    });
                  }}
                  className="w-5 h-5"
                />
                <span>投票者是恶魔（用于卖花女孩）</span>
              </label>
            </div>
            <button 
              onClick={()=>submitVotes(parseInt(voteInputValue)||0)} 
              className="w-full py-4 bg-indigo-600 rounded-xl text-2xl font-bold"
            >
              确认
            </button>
          </div>
        </div>
      )}
      
      {showRoleSelectModal && (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl text-center border-2 border-blue-500 max-w-4xl max-h-[80vh] overflow-y-auto">
            <h3 className="text-3xl font-bold mb-4">
              {showRoleSelectModal.type === 'philosopher' && '🎭 哲学家 - 选择善良角色'}
              {showRoleSelectModal.type === 'cerenovus' && '🧠 洗脑师 - 选择善良角色'}
              {showRoleSelectModal.type === 'pit_hag' && '🧙 麻脸巫婆 - 选择角色'}
            </h3>
            {showRoleSelectModal.type === 'pit_hag' && (
              <p className="text-sm text-gray-300 mb-3">
                当前剧本所有角色与座位号如下（仅供参考）：请先在主界面点选一名玩家作为目标，
                再在此选择一个<strong>当前场上尚未登场</strong>的角色身份，若合法则该玩家立刻变为该角色，并按夜晚顺位在本夜被叫醒。
              </p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
              {roles
                .filter((r: Role) => {
                  if (showRoleSelectModal.type === 'philosopher' || showRoleSelectModal.type === 'cerenovus') {
                    return r.type === 'townsfolk' || r.type === 'outsider';
                  }
                  // 麻脸巫婆：仅显示当前剧本的角色，方便查阅
                  if (selectedScript) {
                    return r.script === selectedScript.name;
                  }
                  return true;
                })
                .map((role: Role) => {
                  const typeColor = typeColors[role.type] || 'border-gray-500 text-gray-400';
                  const typeBgColor = typeBgColors[role.type] || 'bg-gray-900/50 hover:bg-gray-800';
                  return (
                    <button
                      key={role.id}
                      onClick={() => {
                        showRoleSelectModal.onConfirm(role.id);
                      }}
                      className={`p-4 rounded-xl border-2 ${typeColor} ${typeBgColor} transition-all text-left`}
                    >
                      <div className="font-bold text-lg">{role.name}</div>
                      <div className="text-sm opacity-80 mt-1">{typeLabels[role.type]}</div>
                      <div className="text-xs opacity-60 mt-1 line-clamp-2">{role.ability}</div>
                    </button>
                  );
                })}
            </div>
            {showRoleSelectModal.type === 'pit_hag' && (
              <div className="mt-2 mb-4 text-left text-xs text-gray-300 max-h-40 overflow-y-auto border border-gray-700 rounded-xl p-3 bg-gray-900/60">
                <div className="font-bold mb-1">当前座位与角色一览：</div>
                {seats.map(s => (
                  <div key={s.id} className="flex justify-between">
                    <span>[{s.id + 1}号]</span>
                    <span className="ml-2 flex-1 text-right">
                      {getSeatRoleId(s) ? roles.find(r => r.id === getSeatRoleId(s))?.name || '未知角色' : '空位 / 未分配'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowRoleSelectModal(null)}
              className="w-full py-3 bg-gray-600 rounded-xl text-xl font-bold hover:bg-gray-500"
            >
              取消
            </button>
          </div>
        </div>
      )}
      
      {showMadnessCheckModal && (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl text-center border-2 border-purple-500 max-w-md">
            <h3 className="text-3xl font-bold mb-6">🧠 疯狂判定</h3>
            <div className="mb-6 text-left">
              <p className="mb-2">目标：{showMadnessCheckModal.targetId + 1}号</p>
              <p className="mb-2">要求扮演角色：{showMadnessCheckModal.roleName}</p>
              <p className="text-sm text-gray-400 mb-4">
                该玩家需要在白天和夜晚"疯狂"地证明自己是这个角色，否则可能被处决。
              </p>
            </div>
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => {
                  addLog(`${showMadnessCheckModal.targetId + 1}号 疯狂判定：通过（正确扮演 ${showMadnessCheckModal.roleName}）`);
                  setShowMadnessCheckModal(null);
                }}
                className="flex-1 py-3 bg-green-600 rounded-xl font-bold text-lg"
              >
                通过
              </button>
              <button
                onClick={() => {
                  addLog(`${showMadnessCheckModal.targetId + 1}号 疯狂判定：失败（未正确扮演 ${showMadnessCheckModal.roleName}）`);
                  const target = seats.find(s => s.id === showMadnessCheckModal.targetId);
                  if (target && !target.isDead) {
                    // 如果判定失败，说书人可以决定是否处决
                    const shouldExecute = window.confirm(`是否处决 ${showMadnessCheckModal.targetId + 1}号？`);
                    if (shouldExecute) {
                      saveHistory();
                      executePlayer(showMadnessCheckModal.targetId);
                    }
                  }
                  setShowMadnessCheckModal(null);
                }}
                className="flex-1 py-3 bg-red-600 rounded-xl font-bold text-lg"
              >
                失败
              </button>
            </div>
            <button
              onClick={() => setShowMadnessCheckModal(null)}
              className="w-full py-2 bg-gray-600 rounded-xl font-bold hover:bg-gray-500"
            >
              取消
            </button>
          </div>
        </div>
      )}
      
      {showDayActionModal && (
        <div className="fixed inset-0 z-[3000] bg-black/80 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl w-[500px] text-center">
            <h2 className="mb-6 text-3xl font-bold text-red-400">
              {showDayActionModal.type==='slayer'
                ? '💥 开枪'
                : showDayActionModal.type==='lunaticKill'
                  ? '🔪 精神病患者日杀'
                  : '🗣️ 提名'}
            </h2>
            <div className="flex flex-wrap gap-3 justify-center">
              {seats.filter(s=>{
                // 暗月初升剧本：存活玩家可以提名死人
                // 其他剧本：只能提名存活玩家
                if (showDayActionModal?.type === 'nominate' && selectedScript?.id === 'bad_moon_rising') {
                  // 暗月初升：可以提名死人（包括僵怖假死状态）
                  return s.role !== null;
                }
                // 其他情况：只能提名存活玩家
                return !s.isDead;
              }).map(s=>{
                // 8. 提名限制：检查是否已被提名或被提名过
                const isDisabled = showDayActionModal?.type === 'nominate'
                  ? (nominationRecords.nominees.has(s.id) || nominationRecords.nominators.has(showDayActionModal.sourceId))
                  : showDayActionModal?.type === 'lunaticKill'
                    ? s.id === showDayActionModal.sourceId
                    : false;
                return (
                  <button 
                    key={s.id} 
                    onClick={()=>{
                      if (!isDisabled) {
                        if (showDayActionModal?.type === 'nominate' && s.role?.id === 'virgin') {
                          const nominatorSeat = seats.find(seat => seat.id === showDayActionModal.sourceId);
                          const isRealTownsfolk = !!(nominatorSeat &&
                            nominatorSeat.role?.type === 'townsfolk' &&
                            nominatorSeat.role?.id !== 'drunk' &&
                            !nominatorSeat.isDrunk);
                          setVirginGuideInfo({
                            targetId: s.id,
                            nominatorId: showDayActionModal.sourceId,
                            isFirstTime: !s.hasBeenNominated,
                            nominatorIsTownsfolk: isRealTownsfolk
                          });
                          setShowDayActionModal(null);
                          setShowNominateModal(null);
                          return;
                        }
                        handleDayAction(s.id);
                        setShowDayActionModal(null);
                        setShowShootModal(null);
                        setShowNominateModal(null);
                      }
                    }} 
                    disabled={isDisabled}
                    className={`p-4 border-2 rounded-xl text-xl font-bold transition-all ${
                      isDisabled ? 'opacity-30 cursor-not-allowed bg-gray-700' : 
                      'hover:bg-gray-700'
                    }`}
                  >
                    {s.id+1}号 {s.role?.name}
                  </button>
                );
              })}
            </div>
            <button 
              onClick={()=>{
                setShowDayActionModal(null);
                setShowShootModal(null);
                setShowNominateModal(null);
              }} 
              className="mt-8 w-full py-3 bg-gray-600 rounded-xl text-xl"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {virginGuideInfo && (() => {
        const target = seats.find(s => s.id === virginGuideInfo.targetId);
        const nominator = seats.find(s => s.id === virginGuideInfo.nominatorId);
        if (!target) return null;
        const isFirst = virginGuideInfo.isFirstTime;
        const nomIsTown = virginGuideInfo.nominatorIsTownsfolk;
        return (
          <div className="fixed inset-0 z-[3200] bg-black/80 flex items-center justify-center">
            <div className="bg-gray-900 p-8 rounded-2xl w-[620px] text-left space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-pink-200">贞洁者判定向导</h2>
                <span className="text-sm text-gray-400">
                  提名者：{nominator ? `${nominator.id + 1}号 ${nominator.role?.name || ''}` : '未知'}
                  {' · '}
                  目标：{target.id + 1}号 {target.role?.name || ''}
                </span>
              </div>

              <div className="space-y-2">
                <div className="text-lg font-semibold text-white">这是本局贞洁者第几次被提名？</div>
                <div className="flex gap-3">
                  <button
                    className={`flex-1 py-3 rounded-xl font-bold transition ${isFirst ? 'bg-pink-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                    onClick={() => setVirginGuideInfo(p => p ? { ...p, isFirstTime: true } : p)}
                  >
                    第一次
                  </button>
                  <button
                    className={`flex-1 py-3 rounded-xl font-bold transition ${!isFirst ? 'bg-pink-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                    onClick={() => setVirginGuideInfo(p => p ? { ...p, isFirstTime: false } : p)}
                  >
                    不是第一次
                  </button>
                </div>
              </div>

              {isFirst && (
                <div className="space-y-2">
                  <div className="text-lg font-semibold text-white">提名者是镇民 (Townsfolk) 吗？</div>
                  <div className="flex gap-3">
                    <button
                      className={`flex-1 py-3 rounded-xl font-bold transition ${nomIsTown ? 'bg-emerald-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                      onClick={() => setVirginGuideInfo(p => p ? { ...p, nominatorIsTownsfolk: true } : p)}
                    >
                      是镇民
                    </button>
                    <button
                      className={`flex-1 py-3 rounded-xl font-bold transition ${!nomIsTown ? 'bg-amber-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                      onClick={() => setVirginGuideInfo(p => p ? { ...p, nominatorIsTownsfolk: false } : p)}
                    >
                      不是镇民
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-gray-800/80 rounded-xl p-4 text-sm leading-6 text-gray-200 space-y-2">
                {isFirst ? (
                  nomIsTown ? (
                    <>
                      <div>• 这是贞洁者第一次被提名，且提名者是镇民。</div>
                      <div>• 立刻处决提名者，而不是贞洁者。</div>
                      <div>• 公告台词示例： “因为你提名了贞洁者，你被立即处决。”</div>
                      <div>• 将贞洁者技能标记为已用，今后再被提名不再触发。</div>
                    </>
                  ) : (
                    <>
                      <div>• 这是贞洁者第一次被提名，但提名者不是镇民。</div>
                      <div>• 这次提名不产生额外处决。</div>
                      <div>• 贞洁者技能视为已用完（即使这次没有处决任何人）。</div>
                    </>
                  )
                ) : (
                  <>
                    <div>• 贞洁者已经被提名过，能力已失效。</div>
                    <div>• 这次提名按普通提名处理，不会再触发额外处决。</div>
                  </>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  className="flex-1 py-3 bg-pink-600 hover:bg-pink-500 rounded-xl font-bold text-white"
                  onClick={handleVirginGuideConfirm}
                >
                  按此指引继续提名
                </button>
                <button
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-bold text-white"
                  onClick={() => setVirginGuideInfo(null)}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showDayAbilityModal && (() => {
        const { roleId, seatId } = showDayAbilityModal;
        const seat = seats.find(s => s.id === seatId);
        if (!seat) return null;
        const roleName = seat.role?.name || '';
        const closeModal = () => {
          setShowDayAbilityModal(null);
          setDayAbilityForm({});
        };
        const submit = () => {
          if (roleId === 'savant_mr') {
            if (!dayAbilityForm.info1 || !dayAbilityForm.info2) {
              alert('请填写两条信息（可真可假）。');
              return;
            }
            addLog(`${seat.id+1}号(博学者) 今日信息：${dayAbilityForm.info1} / ${dayAbilityForm.info2}`);
            setDayAbilityLogs(prev => [...prev, { id: seat.id, roleId, day: nightCount, text: `${dayAbilityForm.info1} / ${dayAbilityForm.info2}` }]);
            markDailyAbilityUsed('savant_mr', seat.id);
            closeModal();
            return;
          }
          if (roleId === 'amnesiac') {
            if (!dayAbilityForm.guess || !dayAbilityForm.feedback) {
              alert('请填写猜测和反馈。');
              return;
            }
            addLog(`${seat.id+1}号(失意者) 今日猜测：${dayAbilityForm.guess}；反馈：${dayAbilityForm.feedback}`);
            setDayAbilityLogs(prev => [...prev, { id: seat.id, roleId, day: nightCount, text: `猜测：${dayAbilityForm.guess}；反馈：${dayAbilityForm.feedback}` }]);
            markDailyAbilityUsed('amnesiac', seat.id);
            closeModal();
            return;
          }
          if (roleId === 'fisherman') {
            if (!dayAbilityForm.advice) {
              alert('请填写说书人提供的建议。');
              return;
            }
            addLog(`${seat.id+1}号(渔夫) 获得建议：${dayAbilityForm.advice}`);
            setDayAbilityLogs(prev => [...prev, { id: seat.id, roleId, day: nightCount, text: `建议：${dayAbilityForm.advice}` }]);
            markAbilityUsed('fisherman', seat.id);
            closeModal();
            return;
          }
          if (roleId === 'engineer') {
            const mode = dayAbilityForm.engineerMode;
            const newRoleId = dayAbilityForm.engineerRoleId;
            if (!mode) {
              alert('请选择改造目标（恶魔或爪牙）。');
              return;
            }
            if (!newRoleId) {
              alert('请选择要改造成为的角色。');
              return;
            }
            const newRole = roles.find(r => r.id === newRoleId);
            if (!newRole) return;
            if (mode === 'demon' && newRole.type !== 'demon') {
              alert('请选择一个恶魔角色。');
              return;
            }
            if (mode === 'minion' && newRole.type !== 'minion') {
              alert('请选择一个爪牙角色。');
              return;
            }
            if (mode === 'demon') {
              const demonSeat = seats.find(s => s.role?.type === 'demon' || s.isDemonSuccessor);
              if (!demonSeat) {
                alert('场上没有可改造的恶魔。');
                return;
              }
              setSeats(prev => prev.map(s => {
                if (s.id !== demonSeat.id) return s;
                return cleanseSeatStatuses({
                  ...s,
                  role: newRole,
                  charadeRole: null,
                }, { keepDeathState: true });
              }));
              addLog(`${seat.id+1}号(工程师) 将恶魔改造成 ${newRole.name}`);
              // 调整唤醒队列：如果当前在夜晚，将改造后的恶魔插入唤醒队列
              if (['night', 'firstNight'].includes(gamePhase)) {
                insertIntoWakeQueueAfterCurrent(demonSeat.id, { roleOverride: newRole, logLabel: `${demonSeat.id+1}号(${newRole.name})` });
              }
            } else {
              const minions = seats.filter(s => s.role?.type === 'minion');
              if (minions.length === 0) {
                alert('场上没有可改造的爪牙。');
                return;
              }
              setSeats(prev => prev.map(s => {
                if (s.role?.type !== 'minion') return s;
                return cleanseSeatStatuses({
                  ...s,
                  role: newRole,
                  charadeRole: null,
                }, { keepDeathState: true });
              }));
              addLog(`${seat.id+1}号(工程师) 将所有爪牙改造成 ${newRole.name}`);
              // 调整唤醒队列：如果当前在夜晚，将所有改造后的爪牙插入唤醒队列
              if (['night', 'firstNight'].includes(gamePhase)) {
                minions.forEach(m => {
                  insertIntoWakeQueueAfterCurrent(m.id, { roleOverride: newRole, logLabel: `${m.id+1}号(${newRole.name})` });
                });
              }
            }
            markAbilityUsed('engineer', seat.id);
            closeModal();
            return;
          }
        };
        return (
          <div className="fixed inset-0 z-[3200] bg-black/80 flex items-center justify-center px-4">
            <div className="bg-gray-900 border-4 border-blue-500 rounded-2xl p-6 max-w-2xl w-full space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-blue-200">🌞 {roleName} 日间能力</h2>
                <button className="text-gray-400 hover:text-white" onClick={closeModal}>✕</button>
              </div>
              {roleId === 'savant_mr' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-300">填写两条信息（其中一真一假）。</p>
                  <textarea
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                    placeholder="信息1"
                    value={dayAbilityForm.info1 || ''}
                    onChange={e=>setDayAbilityForm(f=>({...f, info1: e.target.value}))}
                  />
                  <textarea
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                    placeholder="信息2"
                    value={dayAbilityForm.info2 || ''}
                    onChange={e=>setDayAbilityForm(f=>({...f, info2: e.target.value}))}
                  />
                </div>
              )}
              {roleId === 'amnesiac' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-300">填写今天的猜测与说书人反馈。</p>
                  <textarea
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                    placeholder="你的猜测"
                    value={dayAbilityForm.guess || ''}
                    onChange={e=>setDayAbilityForm(f=>({...f, guess: e.target.value}))}
                  />
                  <textarea
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                    placeholder="说书人反馈"
                    value={dayAbilityForm.feedback || ''}
                    onChange={e=>setDayAbilityForm(f=>({...f, feedback: e.target.value}))}
                  />
                </div>
              )}
              {roleId === 'fisherman' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-300">记录说书人给出的建议（一次性）。</p>
                  <textarea
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                    placeholder="建议内容"
                    value={dayAbilityForm.advice || ''}
                    onChange={e=>setDayAbilityForm(f=>({...f, advice: e.target.value}))}
                  />
                </div>
              )}
              {roleId === 'engineer' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-300">选择改造恶魔或爪牙，并指定新的角色。</p>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 text-gray-200 text-sm">
                      <input
                        type="radio"
                        checked={dayAbilityForm.engineerMode === 'demon'}
                        onChange={()=>setDayAbilityForm(f=>({...f, engineerMode: 'demon'}))}
                      />
                      改造恶魔
                    </label>
                    <label className="flex items-center gap-2 text-gray-200 text-sm">
                      <input
                        type="radio"
                        checked={dayAbilityForm.engineerMode === 'minion'}
                        onChange={()=>setDayAbilityForm(f=>({...f, engineerMode: 'minion'}))}
                      />
                      改造所有爪牙
                    </label>
                  </div>
                  <select
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                    value={dayAbilityForm.engineerRoleId || ''}
                    onChange={e=>setDayAbilityForm(f=>({...f, engineerRoleId: e.target.value || undefined}))}
                  >
                    <option value="">选择目标角色</option>
                    {(() => {
                      const usedRoleIds = new Set(
                        seats.map(s => getSeatRoleId(s)).filter(Boolean) as string[]
                      );
                      return roles
                        .filter(r => r.type === (dayAbilityForm.engineerMode === 'demon' ? 'demon' : dayAbilityForm.engineerMode === 'minion' ? 'minion' : undefined))
                        .filter(r => !usedRoleIds.has(r.id))
                        .map(r => (
                          <option key={r.id} value={r.id}>{r.name} ({r.type})</option>
                        ));
                    })()}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button className="px-4 py-2 bg-gray-700 rounded" onClick={closeModal}>取消</button>
                <button className="px-4 py-2 bg-blue-600 rounded font-bold" onClick={submit}>确认</button>
              </div>
            </div>
          </div>
        );
      })()}

      <SaintExecutionConfirmModal
        isOpen={!!showSaintExecutionConfirmModal}
        onConfirm={confirmSaintExecution}
        onCancel={cancelSaintExecution}
      />

      <LunaticRpsModal
        isOpen={!!showLunaticRpsModal}
        nominatorId={showLunaticRpsModal?.nominatorId || null}
        targetId={showLunaticRpsModal?.targetId || 0}
        onResolve={resolveLunaticRps}
      />
      
      <VirginTriggerModal
        isOpen={!!showVirginTriggerModal}
        onConfirm={confirmVirginTrigger}
        onCancel={() => setShowVirginTriggerModal(null)}
      />
      
      <RavenkeeperFakeModal
        targetId={showRavenkeeperFakeModal}
        roles={roles}
        onSelect={confirmRavenkeeperFake}
      />
      

      <StorytellerDeathModal
        isOpen={!!showStorytellerDeathModal}
        sourceId={showStorytellerDeathModal?.sourceId || 0}
        seats={seats}
        onConfirm={confirmStorytellerDeath}
      />

      <SweetheartDrunkModal
        isOpen={!!showSweetheartDrunkModal}
        sourceId={showSweetheartDrunkModal?.sourceId || 0}
        seats={seats}
        onConfirm={confirmSweetheartDrunk}
      />

      <KlutzChoiceModal
        isOpen={!!showKlutzChoiceModal}
        sourceId={showKlutzChoiceModal?.sourceId || 0}
        seats={seats}
        selectedTarget={klutzChoiceTarget}
        onSelectTarget={setKlutzChoiceTarget}
        onConfirm={confirmKlutzChoice}
        onCancel={() => {
          setShowKlutzChoiceModal(null);
          setKlutzChoiceTarget(null);
        }}
      />

      <MoonchildKillModal
        isOpen={!!showMoonchildKillModal}
        sourceId={showMoonchildKillModal?.sourceId || 0}
        seats={seats}
        onConfirm={confirmMoonchildKill}
      />
      
      {gamePhase==="dawnReport" && (
        <div className="fixed inset-0 z-[3000] bg-black/95 flex items-center justify-center">
          <div className="bg-gray-800 p-12 rounded-3xl text-center border-4 border-yellow-500 min-w-[500px]">
            <h2 className="text-6xl mb-8">🌅 天亮了！</h2>
            <p className="text-3xl text-gray-300 mb-10">
              昨晚死亡：<span className="text-red-500 font-bold">
                {deadThisNight.length>0 ? deadThisNight.map(id => `${id+1}号`).join('、') : "平安夜"}
              </span>
            </p>
            <button 
              onClick={()=>setGamePhase('day')} 
              className="px-12 py-5 bg-yellow-500 text-black font-bold rounded-full text-3xl"
            >
              开始白天
            </button>
          </div>
        </div>
      )}
      
      {gamePhase==="gameOver" && (
        <div className="fixed inset-0 z-[4000] bg-black/95 flex items-center justify-center">
          <div className="text-center">
            <h1 className={`text-8xl font-bold mb-10 ${
              winResult==='good'?'text-blue-500':'text-red-500'
            }`}>
              {winResult==='good'?'🏆 善良阵营胜利':'👿 邪恶阵营获胜'}
            </h1>
            {winReason && (
              <p className="text-xl text-gray-400 mb-8">
                胜利依据：{winReason}
              </p>
            )}
            {winReason && winReason.includes('猎手') && (
              <p className="text-sm text-gray-500 mb-8">
                按照规则，游戏立即结束，不再进行今天的处决和后续夜晚。
              </p>
            )}
            <div className="flex gap-6 justify-center">
              <button 
                onClick={handleNewGame} 
                className="px-10 py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-3xl font-bold transition-colors"
              >
                再来一局
              </button>
              <button 
                onClick={()=>setShowReviewModal(true)} 
                className="px-10 py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-3xl font-bold transition-colors"
              >
                本局复盘
              </button>
            </div>
          </div>
        </div>
      )}
      
      <ReviewModal
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        seats={seats}
        gameLogs={gameLogs}
        gamePhase={gamePhase}
        winResult={winResult}
        winReason={winReason}
        isPortrait={isPortrait}
      />

      <GameRecordsModal
        isOpen={showGameRecordsModal}
        onClose={() => setShowGameRecordsModal(false)}
        gameRecords={gameRecords}
        isPortrait={isPortrait}
      />

      <RoleInfoModal
        isOpen={showRoleInfoModal}
        onClose={() => setShowRoleInfoModal(false)}
        selectedScript={selectedScript}
        filteredGroupedRoles={filteredGroupedRoles}
        roles={roles}
        groupedRoles={groupedRoles}
      />

      {contextMenu && (() => {
        const targetSeat = seats.find(s => s.id === contextMenu.seatId);
        if (!targetSeat) return null;
        return (
        <div 
          className="absolute bg-gray-800 border-2 border-gray-500 rounded-xl shadow-2xl z-[3000] w-48 overflow-hidden" 
          style={{top:contextMenu.y,left:contextMenu.x}}
        >
          {gamePhase==='dusk' && !targetSeat.isDead && (
            <button 
              onClick={()=>handleMenuAction('nominate')} 
              disabled={nominationRecords.nominators.has(contextMenu.seatId)}
              className={`block w-full text-left px-6 py-4 hover:bg-purple-900 text-purple-300 font-bold text-lg border-b border-gray-600 ${
                nominationRecords.nominators.has(contextMenu.seatId) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              🗣️ 提名
            </button>
          )}
          {/* 开枪可以在任意环节（除了setup阶段） */}
          {!targetSeat.isDead && gamePhase !== 'setup' && (
            <button 
              onClick={()=>handleMenuAction('slayer')} 
              disabled={targetSeat.hasUsedSlayerAbility}
              className={`block w-full text-left px-6 py-4 hover:bg-red-900 text-red-300 font-bold text-lg border-b border-gray-600 ${
                targetSeat.hasUsedSlayerAbility ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              💥 开枪
            </button>
          )}
          {/* 爪牙白天猜测落难少女 */}
          {gamePhase === 'day' && targetSeat.role?.type === 'minion' && !targetSeat.isDead && seats.some(s => s.role?.id === 'damsel') && (
            <button
              onClick={()=>handleMenuAction('damselGuess')}
              disabled={damselGuessUsedBy.includes(targetSeat.id)}
              className={`block w-full text-left px-6 py-3 text-lg font-medium border-t border-gray-700 ${
                damselGuessUsedBy.includes(targetSeat.id)
                  ? 'text-gray-500 cursor-not-allowed bg-gray-800'
                  : 'hover:bg-pink-900 text-pink-300'
              }`}
            >
              🎯 猜测落难少女
            </button>
          )}
          <button 
            onClick={()=>toggleStatus('dead')} 
            className="block w-full text-left px-6 py-3 hover:bg-gray-700 text-lg font-medium"
          >
            💀 切换死亡
          </button>
          {/* 在核对身份阶段，允许选择红罗刹（仅限善良阵营），爪牙和恶魔为灰色不可选，且需要场上有占卜师 */}
          {gamePhase === 'check' && targetSeat.role && (() => {
            const hasFortuneTeller = seats.some(s => s.role?.id === "fortune_teller");
            const isDisabled = ['minion','demon'].includes(targetSeat.role.type) || !hasFortuneTeller;
            return (
              <button
                onClick={()=>!isDisabled && toggleStatus('redherring', targetSeat.id)}
                disabled={isDisabled}
                className={`block w-full text-left px-6 py-3 text-lg font-medium border-t border-gray-700 whitespace-nowrap ${
                  isDisabled
                    ? 'text-gray-500 cursor-not-allowed bg-gray-800'
                    : 'hover:bg-red-900 text-red-300'
                }`}
              >
                🎭 选为红罗刹
              </button>
            );
          })()}
        </div>
        );
      })()}
      
      
      {/* 6. 处决结果弹窗 */}
      <ExecutionResultModal
        isOpen={!!showExecutionResultModal}
        message={showExecutionResultModal?.message || ''}
        onConfirm={confirmExecutionResult}
      />

      <ShootResultModal
        isOpen={!!showShootResultModal}
        message={showShootResultModal?.message || ''}
        isDemonDead={showShootResultModal?.isDemonDead || false}
        onConfirm={confirmShootResult}
      />

      <KillConfirmModal
        targetId={showKillConfirmModal}
        isImpSelfKill={!!(nightInfo && nightInfo.effectiveRole.id === 'imp' && showKillConfirmModal === nightInfo.seat.id)}
        onConfirm={confirmKill}
        onCancel={() => {
          setShowKillConfirmModal(null);
          setSelectedActionTargets([]);
        }}
      />

      <AttackBlockedModal
        isOpen={!!showAttackBlockedModal}
        targetId={showAttackBlockedModal?.targetId || 0}
        reason={showAttackBlockedModal?.reason || ''}
        demonName={showAttackBlockedModal?.demonName}
        onClose={() => setShowAttackBlockedModal(null)}
      />

      <PitHagModal
        isOpen={!!showPitHagModal}
        targetId={showPitHagModal?.targetId || null}
        roleId={showPitHagModal?.roleId || null}
        seats={seats}
        roles={roles}
        onRoleChange={(roleId) => setShowPitHagModal(m => m ? ({...m, roleId}) : m)}
        onCancel={() => setShowPitHagModal(null)}
        onContinue={() => {
          // 保持弹窗打开，由"确认/下一步"执行实际变更
          setShowPitHagModal(m => m ? m : null);
        }}
      />

      <RangerModal
        isOpen={!!showRangerModal}
        targetId={showRangerModal?.targetId || 0}
        roleId={showRangerModal?.roleId || null}
        seats={seats}
        roles={roles}
        selectedScript={selectedScript}
        onRoleChange={(roleId) => setShowRangerModal(m => m ? ({...m, roleId}) : m)}
        onConfirm={() => {
          if (!showRangerModal?.roleId) {
            alert('必须选择一个未在场的镇民角色');
            return;
          }
          const newRole = roles.find(r => r.id === showRangerModal.roleId && r.type === 'townsfolk');
          if (!newRole) {
            alert('角色无效，请重新选择');
            return;
          }
          const targetId = showRangerModal.targetId;
          setSeats(prev => prev.map(s => {
            if (s.id !== targetId) return s;
            const swapped = cleanseSeatStatuses({
              ...s,
              role: newRole,
              charadeRole: null,
              isDemonSuccessor: false,
            }, { keepDeathState: true });
            return swapped;
          }));
          addLog(`巡山人将 ${showRangerModal.targetId+1}号(落难少女) 变为 ${newRole.name}`);
          insertIntoWakeQueueAfterCurrent(showRangerModal.targetId, { roleOverride: newRole, logLabel: `${showRangerModal.targetId+1}号(${newRole.name})` });
          setShowRangerModal(null);
          continueToNextAction();
        }}
      />

      {/* 爪牙猜测落难少女 */}
      <DamselGuessModal
        isOpen={!!showDamselGuessModal}
        minionId={showDamselGuessModal?.minionId || null}
        targetId={showDamselGuessModal?.targetId || null}
        seats={seats}
        damselGuessUsedBy={damselGuessUsedBy}
        onMinionChange={(minionId) => setShowDamselGuessModal(m => m ? ({...m, minionId}) : m)}
        onTargetChange={(targetId) => setShowDamselGuessModal(m => m ? ({...m, targetId}) : m)}
        onCancel={() => setShowDamselGuessModal(null)}
        onConfirm={() => {
          if (showDamselGuessModal!.minionId === null || showDamselGuessModal!.targetId === null) return;
          const minionId = showDamselGuessModal!.minionId;
          const guessSeat = seats.find(s => s.id === showDamselGuessModal!.targetId);
          const isCorrect = guessSeat?.role?.id === 'damsel' && !guessSeat.isDead;
          setShowDamselGuessModal(null);
          setDamselGuessUsedBy(prev => prev.includes(minionId) ? prev : [...prev, minionId]);
          if (isCorrect) {
            setDamselGuessed(true);
            setWinResult('evil');
            setWinReason('爪牙猜中落难少女');
            setGamePhase('gameOver');
            addLog(`爪牙猜测成功：${showDamselGuessModal!.targetId+1}号是落难少女，邪恶获胜`);
          } else {
            const updatedSeats = seats.map(s => s.id === minionId ? { ...s, isDead: true, isSentenced: false } : s);
            setSeats(updatedSeats);
            addLog(`${minionId+1}号爪牙猜错落难少女，当场死亡。`);
            addLog(`爪牙猜测失败：${showDamselGuessModal!.targetId+1}号不是落难少女`);
            checkGameOver(updatedSeats, minionId);
          }
        }}
      />

      {/* 灵言师触发关键词转换 */}
      {showShamanConvertModal && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center px-4">
          <div className="bg-gray-800 border-4 border-purple-500 rounded-2xl p-6 max-w-xl w-full space-y-4">
            <h2 className="text-3xl font-bold text-purple-300">灵言师：关键词被说出</h2>
            <div className="text-gray-200 text-sm">
              请选择第一个公开说出关键词的玩家：若他是善良阵营（镇民/外来者），当晚起被视为邪恶；若本就是邪恶，则不产生额外效果。
            </div>
            <select
              className="w-full bg-gray-900 border border-gray-700 rounded p-2"
              value={shamanConvertTarget ?? ''}
              onChange={e=>setShamanConvertTarget(e.target.value===''?null:Number(e.target.value))}
            >
              <option value="">选择玩家</option>
              {seats.filter(s => !s.isDead).map(s=>(
                <option key={s.id} value={s.id}>[{s.id+1}] {s.role?.name}</option>
              ))}
            </select>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 bg-gray-700 rounded" onClick={()=>{setShowShamanConvertModal(false);setShamanConvertTarget(null);}}>取消</button>
              <button className="px-4 py-2 bg-purple-600 rounded" onClick={()=>{
                if (shamanConvertTarget === null) return;
                const target = seats.find(s => s.id === shamanConvertTarget);
                if (!target || target.isDead) return;
                const isGoodNow = isGoodAlignment(target);
                if (!isGoodNow) {
                  addLog(`灵言师关键词触发检查：${shamanConvertTarget+1}号本就为邪恶阵营，未产生额外效果`);
                  setShamanTriggered(true);
                  setShowShamanConvertModal(false);
                  setShamanConvertTarget(null);
                  return;
                }
                setSeats(prev => prev.map(s => {
                  if (s.id !== shamanConvertTarget) return s;
                  const next = cleanseSeatStatuses({ ...s, isEvilConverted: true }, { keepDeathState: true });
                  const details = Array.from(new Set([...(next.statusDetails || []), '灵言转邪']));
                  return { ...next, statusDetails: details };
                }));
                addLog(`灵言师关键词触发：${shamanConvertTarget+1}号公开说出关键词，从今晚开始被视为邪恶阵营`);
                insertIntoWakeQueueAfterCurrent(shamanConvertTarget, { logLabel: `${shamanConvertTarget+1}号(转邪恶)` });
                setShamanTriggered(true);
                setShowShamanConvertModal(false);
                setShamanConvertTarget(null);
              }}>确认转换</button>
            </div>
          </div>
        </div>
      )}

      {/* 理发师交换角色弹窗 */}
      {showBarberSwapModal && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center px-4">
          <div className="bg-gray-800 border-4 border-blue-500 rounded-2xl p-6 max-w-xl w-full space-y-4">
            <h2 className="text-3xl font-bold text-blue-300">理发师：交换两名玩家角色</h2>
            <div className="text-sm text-gray-300">恶魔（参考）：{showBarberSwapModal.demonId+1}号</div>
            <select
              className="w-full bg-gray-900 border border-gray-600 rounded p-2"
              value={showBarberSwapModal.firstId ?? ''}
              onChange={(e)=>setShowBarberSwapModal(m=> m ? ({...m, firstId: e.target.value===''?null:Number(e.target.value)}) : m)}
            >
              <option value="">选择玩家A</option>
              {seats.filter(s=>s.role?.type !== 'demon' && !s.isDemonSuccessor).map(s=>(
                <option key={s.id} value={s.id}>[{s.id+1}] {s.role?.name}</option>
              ))}
            </select>
            <select
              className="w-full bg-gray-900 border border-gray-600 rounded p-2"
              value={showBarberSwapModal.secondId ?? ''}
              onChange={(e)=>setShowBarberSwapModal(m=> m ? ({...m, secondId: e.target.value===''?null:Number(e.target.value)}) : m)}
            >
              <option value="">选择玩家B</option>
              {seats.filter(s=>s.role?.type !== 'demon' && !s.isDemonSuccessor).map(s=>(
                <option key={s.id} value={s.id}>[{s.id+1}] {s.role?.name}</option>
              ))}
            </select>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 bg-gray-700 rounded" onClick={()=>setShowBarberSwapModal(null)}>取消</button>
              <button className="px-4 py-2 bg-indigo-600 rounded" onClick={()=>{
                if (showBarberSwapModal.firstId === null || showBarberSwapModal.secondId === null || showBarberSwapModal.firstId === showBarberSwapModal.secondId) return;
                const aId = showBarberSwapModal.firstId;
                const bId = showBarberSwapModal.secondId;
                const aSeat = seats.find(s => s.id === aId);
                const bSeat = seats.find(s => s.id === bId);
                if (!aSeat || !bSeat) return;
                const aRole = aSeat.role;
                const bRole = bSeat.role;
                setSeats(prev => prev.map(s => {
                  if (s.id === aId) {
                    const swapped = cleanseSeatStatuses({ ...s, role: bRole, charadeRole: null, isDemonSuccessor: false }, { keepDeathState: true });
                    return swapped;
                  }
                  if (s.id === bId) {
                    const swapped = cleanseSeatStatuses({ ...s, role: aRole, charadeRole: null, isDemonSuccessor: false }, { keepDeathState: true });
                    return swapped;
                  }
                  return s;
                }));
                addLog(`理发师触发：交换了 ${aId+1}号 与 ${bId+1}号 的角色`);
                // 调整唤醒队列：如果当前在夜晚，将交换后的两名玩家插入唤醒队列
                if (['night', 'firstNight'].includes(gamePhase)) {
                  if (aRole && (aRole.firstNightOrder > 0 || aRole.otherNightOrder > 0)) {
                    insertIntoWakeQueueAfterCurrent(aId, { roleOverride: aRole, logLabel: `${aId+1}号(${aRole.name})` });
                  }
                  if (bRole && (bRole.firstNightOrder > 0 || bRole.otherNightOrder > 0)) {
                    insertIntoWakeQueueAfterCurrent(bId, { roleOverride: bRole, logLabel: `${bId+1}号(${bRole.name})` });
                  }
                }
                setShowBarberSwapModal(null);
              }}>确认交换</button>
            </div>
          </div>
        </div>
      )}

      <HadesiaKillConfirmModal
        isOpen={!!showHadesiaKillConfirmModal}
        targetIds={showHadesiaKillConfirmModal || []}
        seats={seats}
        choices={hadesiaChoices}
        onSetChoice={setHadesiaChoice}
        onConfirm={confirmHadesia}
        onCancel={() => {
          setShowHadesiaKillConfirmModal(null);
          setHadesiaChoices({});
          setSelectedActionTargets([]);
        }}
      />

      {/* 市长被攻击时的死亡转移弹窗 */}
      <MayorRedirectModal
        isOpen={!!showMayorRedirectModal}
        targetId={showMayorRedirectModal?.targetId || 0}
        demonName={showMayorRedirectModal?.demonName || ''}
        seats={seats}
        selectedTarget={mayorRedirectTarget}
        onSelectTarget={setMayorRedirectTarget}
        onConfirmNoRedirect={() => {
          setMayorRedirectTarget(null);
          confirmMayorRedirect(null);
        }}
        onConfirmRedirect={(targetId) => confirmMayorRedirect(targetId)}
      />
      
      {/* 投毒者确认下毒弹窗（善良玩家） */}
      <PoisonConfirmModal
        targetId={showPoisonConfirmModal}
        onConfirm={confirmPoison}
        onCancel={() => {
          setShowPoisonConfirmModal(null);
          setSelectedActionTargets([]);
        }}
      />

      <PoisonEvilConfirmModal
        targetId={showPoisonEvilConfirmModal}
        onConfirm={confirmPoisonEvil}
        onCancel={() => {
          setShowPoisonEvilConfirmModal(null);
          setSelectedActionTargets([]);
        }}
      />
      
      <NightDeathReportModal
        message={showNightDeathReportModal}
        onConfirm={confirmNightDeathReport}
      />

      <RestartConfirmModal
        isOpen={showRestartConfirmModal}
        onConfirm={confirmRestart}
        onCancel={() => setShowRestartConfirmModal(false)}
      />

      {/* 伪装身份识别浮窗 */}
      {showSpyDisguiseModal && (() => {
        const spySeats = seats.filter(s => s.role?.id === 'spy');
        const recluseSeats = seats.filter(s => s.role?.id === 'recluse');
        const chefSeat = seats.find(s => s.role?.id === 'chef');
        const empathSeat = seats.find(s => s.role?.id === 'empath');
        const investigatorSeat = seats.find(s => s.role?.id === 'investigator');
        const fortuneTellerSeat = seats.find(s => s.role?.id === 'fortune_teller');
        const hasInterferenceRoles = (spySeats.length > 0 || recluseSeats.length > 0) && 
                                    (chefSeat || empathSeat || investigatorSeat || fortuneTellerSeat);
        
        return (
          <div 
            className="fixed inset-0 z-[5000] bg-black/50 flex items-center justify-center"
            onClick={() => setShowSpyDisguiseModal(false)}
          >
            <div 
              className="bg-gray-800 border-2 border-purple-500 rounded-xl p-4 w-80 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-bold text-purple-300">🎭 伪装身份识别</h3>
                <button
                  onClick={() => setShowSpyDisguiseModal(false)}
                  className="text-gray-400 hover:text-white text-xl"
                >
                  ×
                </button>
              </div>
              
              {hasInterferenceRoles ? (
                <div className="space-y-3 text-sm">
                  {spySeats.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1">间谍：</div>
                      {spySeats.map(s => (
                        <div key={s.id} className="text-gray-300 ml-2">{s.id + 1}号</div>
                      ))}
                    </div>
                  )}
                  {recluseSeats.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1">隐士：</div>
                      {recluseSeats.map(s => (
                        <div key={s.id} className="text-gray-300 ml-2">{s.id + 1}号</div>
                      ))}
                    </div>
                  )}
                  <div className="pt-2 border-t border-gray-700">
                    <div className="text-xs text-gray-400 mb-2">干扰模式：</div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setSpyDisguiseMode('off')}
                        className={`flex-1 py-1.5 px-2 text-xs rounded ${
                          spyDisguiseMode === 'off' 
                            ? 'bg-red-600 text-white' 
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        关闭
                      </button>
                      <button
                        onClick={() => setSpyDisguiseMode('default')}
                        className={`flex-1 py-1.5 px-2 text-xs rounded ${
                          spyDisguiseMode === 'default' 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        默认
                      </button>
                      <button
                        onClick={() => setSpyDisguiseMode('on')}
                        className={`flex-1 py-1.5 px-2 text-xs rounded ${
                          spyDisguiseMode === 'on' 
                            ? 'bg-green-600 text-white' 
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        开启
                      </button>
                    </div>
                  </div>
                  {spyDisguiseMode === 'on' && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-300 flex-shrink-0">概率：</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={spyDisguiseProbability * 100}
                        onChange={(e) => setSpyDisguiseProbability(parseInt(e.target.value) / 100)}
                        className="flex-1"
                      />
                      <span className="text-xs text-gray-300 w-10 text-right">
                        {Math.round(spyDisguiseProbability * 100)}%
                      </span>
                    </div>
                  )}
                  {spyDisguiseMode === 'default' && (
                    <div className="text-xs text-gray-400">
                      默认概率：80%
                    </div>
                  )}
                  {(chefSeat || empathSeat || investigatorSeat || fortuneTellerSeat) && (
                    <div className="text-xs text-gray-400 pt-2 border-t border-gray-700">
                      受影响角色：{chefSeat && '厨师'} {chefSeat && (empathSeat || investigatorSeat || fortuneTellerSeat) && '、'}
                      {empathSeat && '共情者'} {(chefSeat || empathSeat) && (investigatorSeat || fortuneTellerSeat) && '、'}
                      {investigatorSeat && '调查员'} {(chefSeat || empathSeat || investigatorSeat) && fortuneTellerSeat && '、'}
                      {fortuneTellerSeat && '占卜师'}
                    </div>
                  )}
                  {(() => {
                    const infoViewers = [
                      { id: 'washerwoman', name: '洗衣妇' },
                      { id: 'investigator', name: '调查员' },
                      { id: 'chef', name: '厨师' },
                      { id: 'empath', name: '共情者' },
                      { id: 'fortune_teller', name: '占卜师' },
                    ].map(v => {
                      const seat = seats.find(s => s.role?.id === v.id);
                      return seat?.role ? { ...v, role: seat.role } : null;
                    }).filter(Boolean) as Array<{id: string; name: string; role: Role}>;
                    const affected = seats.filter(s => s.role && (s.role.id === 'spy' || s.role.id === 'recluse'));
                    const typeLabels: Record<RoleType, string> = { townsfolk: '镇民', outsider: '外来者', minion: '爪牙', demon: '恶魔' };
                    if (affected.length === 0 || infoViewers.length === 0) return null;
                    return (
                      <div className="mt-3 border-t border-gray-700 pt-2 text-xs text-gray-300 space-y-2">
                        <div className="text-purple-300 font-semibold">🧾 注册结果（仅说书人可见）</div>
                        {affected.map(target => (
                          <div key={target.id} className="bg-gray-750 rounded p-2 border border-gray-700">
                            <div className="font-medium mb-1">{target.id + 1}号【{target.role?.name || '未知'}】</div>
                            <div className="space-y-1">
                              {infoViewers.map(viewer => {
                                const reg = getRegistrationCached(target, viewer.role);
                                const typeText = reg.roleType ? typeLabels[reg.roleType] || reg.roleType : '无类型';
                                const status = reg.registersAsDemon
                                  ? '视为恶魔'
                                  : reg.registersAsMinion
                                    ? '视为爪牙'
                                    : `阵营=${reg.alignment === 'Evil' ? '邪恶' : '善良'}, 类型=${typeText}`;
                                return (
                                  <div key={`${viewer.id}-${target.id}`} className="flex items-center justify-between gap-2">
                                    <span className="text-gray-400">在【{viewer.name}】眼中</span>
                                    <span className="text-white">{status}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="text-sm text-gray-400 text-center py-4">
                  当前无需要伪装身份识别的角色
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </>
  );
}
