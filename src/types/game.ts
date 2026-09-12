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
  /**
   * 规则执行用的真实角色（如疯子仍是 lunatic：执行走疯子能力，绝不真杀）。
   * ⚠️ 不可直接用于玩家视角展示 —— 玩家视角请用 `playerFacingRole`。
   */
  effectiveRole: Role;
  /**
   * 玩家视角下"我以为我是谁"（A2）：
   *   - 疯子 → seat.apparentDemonRole（涡流/沙巴洛斯…按该恶魔的能力显示）；
   *   - 酒鬼 / 提线木偶 → seat.charadeRole；
   *   - 其他角色 → 与 effectiveRole 相同。
   * 由 utils/nightInfoGenerator.ts 统一填充，消费者只需 `playerFacingRole ?? effectiveRole`。
   */
  playerFacingRole?: Role;
  /**
   * 玩家视角的夜间指引文案（把说书人指令留在 guide / guideText 里，不污染玩家面）。
   * 典型场景：疯子的 guide 是"唤醒X号【疯子】（假涡流行动）…"，而玩家面必须是
   * 涡流自己的技能描述。
   */
  playerFacingGuide?: string;
  /**
   * 说书人专属补充说明（**绝不允许出现在玩家页面**）。
   * 例：恶魔互认时那句「提线木偶 X号 不知道自己其实是爪牙，请勿让它察觉」——
   * 官方只保证"恶魔知道谁是提线木偶"，这句操作提醒是说书写给说书人自己的。
   * 只由说书人控制台（GameConsole）渲染。
   */
  storytellerNote?: string;
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
  historyIndex: number; // Undo/Redo 指针
  reminderTokens: Record<number, any[]>; // 每座位提醒标记
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
  selectedScript?: any;
  scriptId?: string;
  scriptName?: string;
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
