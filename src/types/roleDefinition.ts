import { GamePhase, Seat, Role } from "./game";
import { ModalType } from "./modal";

/**
 * 描述行动结果的日志


 * - publicLog: 公开日志（如：某人死亡）
 * - privateLog: 说书人可见日志（如：僧侣保护了X）
 * - secretInfo: 只有当前玩家可见的信息（如：占卜师看到"是"）
 */
export interface ActionLog {
  publicLog?: string;
  privateLog?: string;
  secretInfo?: string;
}

/**
 * 夜晚行动上下文信息
 * 提供给 handler 函数的完整游戏状态
 */
export interface NightActionContext {
  seats: Seat[];
  targets: number[];   // 选中的座位ID列表
  selfId: number;      // 发动技能的玩家ID
  gamePhase: GamePhase;
  nightCount: number;  // 当前是第几夜（首夜为0）
  roles?: Role[];       // 当前剧本的所有角色列表

  /**
   * 是否已通过二次确认弹窗
   * 用于需要二次确认的角色（如投毒者毒邪恶玩家）
   */
  isConfirmed?: boolean;

  /**
   * 弹窗回调传递的额外数据
   * 用于需要弹窗选择特殊数据的角色（如麻脸巫婆选择变换角色）
   */
  actionData?: any;

  /**
   * 环境状态标志
   */
  vortoxWorld?: boolean;
  poppyGrowerDead?: boolean;
  lastDuskExecution?: number | null;
  outsiderDiedToday?: boolean;
  deadThisNight?: number[];
  demonVotedToday?: boolean;
  minionNominatedToday?: boolean;
  executedToday?: number | null;

  /**
   * 查验相关上下文
   */
  isPoisoned?: boolean;
  shouldShowFake?: boolean;
  isEvilWithJudgmentFn?: (seat: Seat) => boolean;
  drunkFirstInfoMap?: Map<number, boolean>;

  /**
   * 辅助函数（主要用于需要弹窗回调更新状态的角色）
   */
  helpers?: {
    setSeats: React.Dispatch<React.SetStateAction<Seat[]>>;
    addLog: (msg: string) => void;
    setCurrentModal: React.Dispatch<React.SetStateAction<ModalType>>;
    continueToNextAction: () => void;
    markAbilityUsed: (roleId: string, seatId: number) => void;
    hasUsedAbility: (roleId: string, seatId: number) => boolean;
    reviveSeat: (seat: Seat) => Seat;
    insertIntoWakeQueueAfterCurrent: (seatId: number, options?: any) => void;
  }
}

/**
 * 夜晚行动处理结果
 * handler 函数返回的状态变更信息
 */
export interface NightActionResult {
  /**
   * 需要更新的座位状态列表
   * 每个对象必须包含 id 字段，其他字段为需要更新的部分状态
   */
  updates: Array<Partial<Seat> & { id: number }>;

  /**
   * 产生的日志信息
   */
  logs?: ActionLog;

  /**
   * 需要触发的弹窗（可选）
   */
  modal?: ModalType;
}

/**
 * 夜晚行动目标选择配置
 */
export interface NightTargetConfig {
  /**
   * 需要选择的目标数量范围
   */
  count: {
    min: number;
    max: number;
  };

  /**
   * 目标合法性检查函数
   * @param target 目标座位
   * @param self 发动技能的玩家座位
   * @param allSeats 所有座位数组
   * @param selectedTargets 已选择的目标ID列表
   * @returns true 表示该目标可选，false 表示不可选
   */
  canSelect?: (
    target: Seat,
    self: Seat,
    allSeats: Seat[],
    selectedTargets: number[]
  ) => boolean;

  /**
   * 动态生成合法目标ID列表（可选）
   */
  validTargetIds?: (
    currentSeatId: number,
    seats: Seat[],
    gamePhase: GamePhase
  ) => number[];
}

/**
 * 夜晚行动对话配置
 * 提供给说书人的台词和指引
 */
export interface NightDialog {
  /**
   * 唤醒台词（如："占卜师，请醒来"）
   */
  wake: string;

  /**
   * 指令台词（如："请选择一名玩家"）
   */
  instruction: string;

  /**
   * 闭眼台词（如："占卜师，请闭眼"）
   */
  close: string;
}

/**
 * 夜晚行动配置
 */
export interface NightActionConfig {
  /**
   * 唤醒顺序（数字越小越早）
   * 首夜和后续夜晚可能不同，通过 firstNight 参数区分
   */
  order: number | ((isFirstNight: boolean) => number);

  /**
   * 目标选择配置
   */
  target: NightTargetConfig;

  /**
   * 给说书人的台词/指引
   * @param playerSeatId 玩家座位ID
   * @param isFirstNight 是否为首夜
   * @param context 夜晚行动上下文（可选，用于生成动态对话）
   */
  dialog: (playerSeatId: number, isFirstNight: boolean, context: NightActionContext) => NightDialog;

  /**
   * 核心逻辑处理函数
   * 输入当前状态和目标，返回状态变更
   * 注意：这里不要直接修改 state，而是返回需要更新的数据
   * 
   * @param context 夜晚行动上下文
   * @returns 状态更新和日志信息
   */
  handler?: (context: NightActionContext) => NightActionResult | null;
}

/**
 * 白天行动上下文信息
 */
export interface DayActionContext {
  seats: Seat[];
  selfId: number;
  targets: number[];
  gamePhase: GamePhase;
  roles: Role[];
  killPlayer: (targetId: number, options?: any) => void;
}

/**
 * 白天行动处理结果
 */
export interface DayActionResult {
  updates: Array<Partial<Seat> & { id: number }>;
  logs: ActionLog;
  modal?: ModalType;
}

/**
 * 白天行动配置
 */
export interface DayActionConfig {
  /**
   * 行动名称
   */
  name: string;

  /**
   * 最大使用次数 (1 或 'infinity')
   */
  maxUses: number | 'infinity';

  /**
   * 目标配置
   */
  target: {
    min: number;
    max: number;
    canSelect?: (target: Seat, self: Seat, allSeats: Seat[]) => boolean;
  };

  /**
   * 核心逻辑处理函数
   */
  handler: (context: DayActionContext) => DayActionResult;
}

/**
 * 处决上下文信息
 * 提供给 onExecution 函数的完整游戏状态
 */
export interface ExecutionContext {
  /**
   * 被处决的玩家座位
   */
  executedSeat: Seat;

  /**
   * 所有座位
   */
  seats: Seat[];

  /**
   * 游戏阶段
   */
  gamePhase: GamePhase;

  /**
   * 当前夜晚计数
   */
  nightCount: number;

  /**
   * 提名映射（谁提名了谁）
   */
  nominationMap: Record<number, number>;

  /**
   * 是否强制处决（跳过确认弹窗）
   */
  forceExecution?: boolean;

  /**
   * 是否跳过精神病患者石头剪刀布
   */
  skipLunaticRps?: boolean;
}

/**
 * 处决处理结果
 */
export interface ExecutionResult {
  /**
   * 是否已处理（如果返回 true，默认处决逻辑将不再执行）
   */
  handled: boolean;

  /**
   * 需要更新的座位状态列表
   */
  seatUpdates?: Array<Partial<Seat> & { id: number }>;

  /**
   * 游戏是否结束
   */
  gameOver?: {
    winResult: 'good' | 'evil';
    winReason: string;
  };

  /**
   * 产生的日志信息
   */
  logs?: {
    publicLog?: string;
    privateLog?: string;
  };

  /**
   * 是否需要等待（例如需要弹窗确认）
   */
  shouldWait?: boolean;

  /**
   * 是否需要继续到下一个夜晚
   */
  shouldContinueToNight?: boolean;

  /**
   * 需要触发的弹窗（可选）
   */
  modal?: ModalType;
}

/**
 * 核心：角色定义接口
 * 用于描述任意角色的规则和行为
 */
export interface RoleDefinition {
  /**
   * 角色唯一标识符（必须与 Role.id 一致）
   */
  id: string;

  /**
   * 角色名称（必须与 Role.name 一致）
   */
  name: string;

  /**
   * 角色类型
   */
  type: 'townsfolk' | 'outsider' | 'minion' | 'demon' | 'traveler';

  /**
   * 角色长描述（官方维基上的详细技能说明，支持Markdown）
   */
  detailedDescription?: string;

  /**
   * 补充说明/细节澄清（官方规则或特例提醒）
   */
  clarifications?: string[];

  /**
   * 夜晚行动配置
   * 如果角色没有夜晚行动，则不需要此字段
   */
  night?: NightActionConfig;

  /**
   * 首夜行动配置（可选）
   * 如果首夜和后续夜晚行动不同，可以单独配置
   * 如果不提供，则使用 night 配置
   */
  firstNight?: NightActionConfig;

  /**
   * 处决处理函数（可选）
   * 当该角色被处决时调用，用于处理特殊的处决逻辑
   * 如果返回 handled: true，默认处决逻辑将不再执行
   * 
   * @param context 处决上下文
   * @returns 处决处理结果
   */
  onExecution?: (context: ExecutionContext) => ExecutionResult;

  /**
   * 角色初始化处理函数（可选）
   * 在游戏开始设置座位角色时调用，用于初始化特殊的角色状态（如祖母绑定孙子）
   * 
   * @param context 设置上下文
   * @returns 初始化的状态更新
   */
  onSetup?: (context: { seats: Seat[]; selfId: number }) => ExecutionResult | { handled: boolean } | any;

  /**
   * 白天行动配置（可选）
   * 如果角色有白天主动发动的技能，可以在此配置
   */
  day?: DayActionConfig;
}

