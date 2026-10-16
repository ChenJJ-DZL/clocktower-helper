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
   * 🌺 纯被动角色标记：该角色的"有效角色"没有任何夜间行动
   * （既无新引擎夜序优先级，也无 legacy night/firstNight 配置）。
   *
   * 由 utils/nightInfoGenerator.ts 的兜底分支填充（该分支为"UI 不为空"服务，
   * 全库 50+ 角色命中，不可删除）。下游（useNightActionHandler / 队列推进）
   * 见到本标记为 true 时必须**跳过唤醒与能力派发**，否则会误弹
   * 「N号-角色名 - 结果」信息窗（罂粟种植者实测缺陷）。
   *
   * 正常情况下纯被动角色不应进入 wakeQueueIds（见 dynamicQueueGenerator
   * 的 roleHasNightAction 准入不变式），本标记是第二道防线。
   */
  passiveNoAction?: boolean;
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

  /**
   * 🧠 洗脑师专属：被洗脑玩家的「得知自己被洗脑」节点数据。
   * 由 utils/cerenovusNotice.ts 的合成节点填充（目标自身无夜间技能时）。
   * ⚠️ 该字段含目标座位号与疯狂角色名（都是被洗脑者本人应知的），
   * 但页面绝不能由它反推出行动者 —— 行动者信息只走 storytellerNote。
   */
  cerenovusNotice?: { targetId: number; roleName: string };
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
  /** 📋 操作记录（随快照持久化；2026-09-24 修复「继续对局后复盘没有信息」） */
  gameLogs?: LogEntry[];
  /** ⭐ 传奇角色（不占座位，全局规则生效；随快照持久化防刷新丢失） */
  activeFabled?: any[];
  /** 🧳 旅行者座位（位置化定长 4 位，null=空位；随快照持久化防刷新丢失） */
  travelers?: (any | null)[];
  /**
   * 🌆 暮色阶段当前步骤索引（旅行者行进中，0-based）。
   * ⚠️ 漏登记 ⇒ 刷新/恢复对局后暮色从第一步重头开始（2026-10-13 E2E ⑥ 实测发现）。
   */
  twilightStepIndex?: number;
  /**
   * 🌆 暮色阶段投票目标（官员/窃贼在暮色选定，次日白天投票结算时消费）。
   * ⚠️ 漏登记 ⇒ 刷新后"选了目标却失效"。
   */
  twilightVoteTargets?: {
    bureaucratTargetId: number | null;
    thiefTargetId: number | null;
  };
  /** 旅行者接线（批 1）：替罪羊 / 枪手 的说书人裁决与频次闩锁 */
  travelerHookChoices?: {
    scapegoatSubstituteForId: number | null;
    gunslingerEligibleVoterIds: number[];
    gunslingerTargetId: number | null;
    gunslingerWindowNight: number | null;
    gunslingerUsedNight: number | null;
    /** ⚖️ 法官「每局限一次」闩锁（漏登记 ⇒ 刷新后能力可被反复使用） */
    judgeUsedThisGame?: boolean;
    /** 🥩 屠夫「本白天已用第二次处决」标记（= 使用时的 nightCount） */
    butcherExtraExecutionDay?: number | null;
    /** 🦴 集骨者整局一次闩锁 */
    boneCollectorUsed?: boolean;
    /** 🦴 集骨者当前祝福的座位（死者重新获得能力，直到下个黄昏） */
    boneCollectorTargetId?: number | null;
    /** ☕ 咖啡师：目标与效果（clear = 解除并免疫毒醉 / double = 能力两次） */
    baristaTargetId?: number | null;
    baristaEffect?: "clear" | "double" | null;
    /** 🌙 流莺：目标 / 是否同意 / 是否双死 */
    harlotTargetId?: number | null;
    harlotAgreed?: boolean;
    harlotDoomed?: boolean;
    /** 🎓 学徒：首个夜晚被授予的角色 id（说书人助手口径） */
    apprenticeGrantedRoleId?: string | null;
    /** 🪑 女舍监本日已交换的座位对（每白天至多 3 对） */
    matronSwaps?: { a: number; b: number }[];
  };
  /** 🎴 传奇角色说书人状态（fibbin / 天使 / 革命者 / 哨兵 / 圣洁之魂 / 摆渡人 / 玩具匠） */
  fabledState?: {
    fibbinUsed?: boolean;
    fibbinTargetId?: number | null;
    angelProtectedSeatId?: number | null;
    angelPunishedSeatId?: number | null;
    revolutionaryPair?: { a: number; b: number } | null;
    revolutionaryDisguiseUsed?: boolean;
    sentinelOutsiderDelta?: number;
    spiritOfIvoryCapped?: boolean;
    ferrymanLastDayResolved?: boolean;
    toymakerAttackSkipped?: boolean;
  };
  /** 旅行者阵营映射（P0）：key = travelers 槽位下标，value = 本局指定阵营 */
  travelerAlignments?: { [slot: number]: "good" | "evil" };
  /** 🥣 乞丐投票标记账本：tokens = 可用标记数；donations = 捐赠者与得知的阵营 */
  beggarState?: {
    tokens: number;
    donations: { donorSeatId: number; knownAlignment: "good" | "evil" }[];
  };
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
  twilight: "暮色",
  night: "夜晚",
  dawnReport: "天亮结算",
  gameOver: "游戏结束",
};
