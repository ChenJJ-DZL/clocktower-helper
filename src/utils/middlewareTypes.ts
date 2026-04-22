/**
 * 中间件类型定义
 * 抽离到单独文件解决循环依赖问题
 */
// 游戏状态快照接口（与现有系统兼容，新引擎独立定义）
export interface GameStateSnapshot {
  nightCount: number;
  seats: any[];
  statusEffects: Record<number, any[]>;
  gamePhase: string;
  [key: string]: any;
}

// 夜间行动节点
export interface NightActionNode {
  seatId: number;
  roleId: string;
  roleName: string;
  priority: number;
  isFirstNightOnly: boolean;
  abilityId: string;
  wakeMessage: string;
  wakePriority: number;
  targetIds: number[];
  processed: boolean;
  success: boolean;
  meta: Record<string, any>;
}

// 中间件上下文
export interface MiddlewareContext {
  /** 当前游戏状态快照 */
  snapshot: GameStateSnapshot;
  /** 当前处理的夜间行动节点 */
  actionNode: NightActionNode;
  /** 选择的目标玩家ID列表 */
  targetIds: number[];
  /** 说书人输入的额外参数 */
  storytellerInput?: any;
  /** 中间件执行过程中传递的临时数据 */
  meta: Record<string, any>;
  /** 是否终止执行管道 */
  aborted: boolean;
  /** 终止原因 */
  abortReason?: string;
}

// 前置校验中间件：检查技能是否可执行（醉酒、中毒、死亡、保护等）
export type PreCheckMiddleware = (
  context: MiddlewareContext
) => Promise<MiddlewareContext>;

// 效果计算中间件：计算技能的实际效果（占卜师结果、投毒目标等）
export type CalculateMiddleware = (
  context: MiddlewareContext
) => Promise<MiddlewareContext>;

// 状态更新中间件：生成新的状态快照（不可变）
export type StateUpdateMiddleware = (
  context: MiddlewareContext
) => Promise<MiddlewareContext>;

// 后置处理中间件：处理连锁反应（死亡触发技能、阵营胜利判断等）
export type PostProcessMiddleware = (
  context: MiddlewareContext
) => Promise<MiddlewareContext>;

// 通用中间件函数类型
export type MiddlewareFunction = (
  context: MiddlewareContext
) => Promise<MiddlewareContext>;

// 技能执行中间件集合
export interface AbilityMiddlewareSet {
  preCheck: PreCheckMiddleware[];
  calculate: CalculateMiddleware[];
  stateUpdate: StateUpdateMiddleware[];
  postProcess: PostProcessMiddleware[];
}
