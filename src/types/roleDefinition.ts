import { GamePhase, Seat } from "./game";

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
  logs: ActionLog;
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
   */
  dialog: (playerSeatId: number, isFirstNight: boolean) => NightDialog;
  
  /**
   * 核心逻辑处理函数
   * 输入当前状态和目标，返回状态变更
   * 注意：这里不要直接修改 state，而是返回需要更新的数据
   * 
   * @param context 夜晚行动上下文
   * @returns 状态更新和日志信息
   */
  handler: (context: NightActionContext) => NightActionResult;
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
}

