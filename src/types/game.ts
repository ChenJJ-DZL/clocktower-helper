// 从 data.ts 导入相关类型
import type {
  DayActionMeta,
  GamePhase,
  LogEntry,
  NightActionMeta,
  Role,
  RoleType,
  Seat,
  SetupMeta,
  StatusEffect,
  TriggerMeta,
  WinResult,
} from "../../app/data";
import type { NightActionSnapshot } from "../../app/gameLogic";

// 重新导出相关类型
export type {
  DayActionMeta,
  GamePhase,
  LogEntry,
  NightActionMeta,
  Role,
  RoleType,
  Seat,
  SetupMeta,
  StatusEffect,
  TriggerMeta,
  WinResult,
};

// --- 辅助类型 ---
export interface NightHintState {
  isPoisoned: boolean;
  reason?: string;
  guide: string;
  speak: string;
  action?: string;
  fakeInspectionResult?: string;
}

export interface NightInfoResult extends Partial<NightActionSnapshot> {
  seat: Seat;
  effectiveRole: Role;
  isPoisoned: boolean;
  reason?: string;
  guide: string;
  speak: string;
  action: string;
  logMessage?: string;
  meta?: {
    targetType?: string; // ADDED: targetType
    amount?: number; // ADDED: amount
    targetCount?: {
      min: number;
      max: number;
    };
  };
  interaction?: any; // ADDED: interaction object (using any for now to avoid circular deps or complex importing, or define Interaction interface above)

  // Enforce these from NightActionSnapshot
  targetLimit?: { min: number; max: number };
  validTargetIds?: number[];
  canSelectDead?: boolean;
  canSelectSelf?: boolean;
}

// 夜间时间线相关类型
export interface TimelineInteractionEffect {
  type: "add_status" | "kill" | "protect" | "info" | "none";
  value?: string;
}

export interface TimelineInteraction {
  type: "choosePlayer" | "none";
  amount: number;
  required: boolean;
  canSelectSelf: boolean;
  canSelectDead: boolean;
  effect: TimelineInteractionEffect;
}

export interface TimelineStepContent {
  title: string;
  script: string;
  instruction: string;
}

export interface TimelineStep {
  id: string;
  type: "character" | "dawn";
  seatId?: number;
  roleId?: string;
  order: number;
  content: TimelineStepContent;
  interaction?: TimelineInteraction;
}

// 游戏快照类型（用于保存/恢复游戏状态）
export interface GameSnapshot {
  gamePhase: string;
  nightCount: number;
  deadThisNight: number[];
  executedPlayerId: number | null;
  wakeQueueIds: number[];
  currentWakeIndex: number;
  selectedActionTargets: number[];
  currentHint: any;
  inspectionResult: string | null;
  inspectionResultKey: number;
  todayDemonVoted: boolean;
  todayMinionNominated: boolean;
  todayExecutedId: number | null;
  witchCursedId: number | null;
  witchActive: boolean;
  cerenovusTarget: any;
  isVortoxWorld: boolean;
  fangGuConverted: boolean;
  jugglerGuesses: any;
  evilTwinPair: any;
  outsiderDiedToday: boolean;
  gossipStatementToday: string;
  gossipTrueTonight: boolean;
  gossipSourceSeatId: number | null;
  timer: number;
  startTime: string | null;
  selectedRole: any;
  spyDisguiseMode: string;
  spyDisguiseProbability: number;
  poppyGrowerDead: boolean;
  pukkaPoisonQueue: any[];
  poChargeState: any;
  usedOnceAbilities: Record<string, number>;
  usedDailyAbilities: Record<string, number>;
  balloonistKnownTypes: Record<number, string[]>;
  hasExecutedThisDay: boolean;
  votedThisRound: number[];
  lastDuskExecution: number | null;
  currentDuskExecution: number | null;
  history: any[];
  initialSeats: any[];
  victorySnapshot: any[];
  winResult: string | null;
  winReason: string | null;
  mayorRedirectTarget: number | null;
  damselGuessed: boolean;
  damselGuessUsedBy: number[];
  klutzChoiceTarget: number | null;
  shamanKeyword: string | null;
  shamanTriggered: boolean;
  shamanConvertTarget: number | null;
  autoRedHerringInfo: any;
  dayAbilityLogs: any[];
  nominationMap: Record<string, any>;
  nominationRecords: { nominators: number[]; nominees: number[] };
  mastermindFinalDay: any;
  remainingDays: number | null;
  goonDrunkedThisNight: boolean;
  hadesiaChoices: Record<number, string>;
  virginGuideInfo: any;
  voteRecords: any[];
  seatNotes: Record<number, string>;
  hadesiaChoiceEnabled: boolean;
  lastExecutedPlayerId: number | null;
  fangGuConvertedSeatId: number | null;
  seats?: any[];
}

// 对局记录数据结构
export interface GameRecord {
  id: string; // 唯一ID
  scriptName: string; // 剧本名称
  startTime: string; // 游戏开始时间
  endTime: string; // 游戏结束时间
  duration: number; // 游戏总时长（秒）
  winResult: WinResult; // 游戏结果
  winReason: string | null; // 胜利原因
  seats: Seat[]; // 座位信息（游戏结束时的状态）
  gameLogs: LogEntry[]; // 游戏日志
  isCompleted?: boolean; // 是否完整结束（有胜利结果）
  snapshot?: any; // 游戏快照（用于继续未完成的对局）
}

export const phaseNames: Record<string, string> = {
  setup: "准备阶段",
  check: "核对身份",
  firstNight: "首夜",
  day: "白天",
  dusk: "黄昏/处决",
  night: "夜晚",
  dawnReport: "天亮结算",
  gameOver: "游戏结束",
};
