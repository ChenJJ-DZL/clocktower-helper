/**
 * 中间件管道
 * 技能执行的标准流程抽象，实现职责链模式，支持灵活扩展中间件
 */

import { abilityPriorityCalculation } from "./abilityPriorityMiddleware";
import type { GameStateSnapshot, NightActionNode } from "./nightStateMachine";

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

// 技能执行中间件集合
export interface AbilityMiddlewareSet {
  preCheck: PreCheckMiddleware[];
  calculate: CalculateMiddleware[];
  stateUpdate: StateUpdateMiddleware[];
  postProcess: PostProcessMiddleware[];
}

// 默认空中间件，直接通过
const defaultMiddleware = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => context;

/**
 * 中间件管道执行器
 * 按顺序执行一组中间件，传递上下文
 */
export async function runMiddlewarePipeline(
  middlewares: Array<
    (context: MiddlewareContext) => Promise<MiddlewareContext>
  >,
  initialContext: MiddlewareContext
): Promise<MiddlewareContext> {
  let context = { ...initialContext };

  for (const middleware of middlewares) {
    if (context.aborted) {
      break;
    }
    context = await middleware(context);
  }

  return context;
}

/**
 * 执行完整的技能处理流程
 */
export async function runFullAbilityPipeline(
  middlewareSet: Partial<AbilityMiddlewareSet>,
  initialContext: MiddlewareContext
): Promise<MiddlewareContext> {
  const {
    preCheck = [defaultMiddleware],
    calculate = [defaultMiddleware],
    stateUpdate = [defaultMiddleware],
    postProcess = [defaultMiddleware],
  } = middlewareSet;

  // 注入全局优先级中间件到calculate阶段最前面
  const enhancedCalculate = [abilityPriorityCalculation, ...calculate];

  // 按顺序执行四个阶段
  let context = await runMiddlewarePipeline(preCheck, initialContext);
  if (context.aborted) return context;

  context = await runMiddlewarePipeline(enhancedCalculate, context);
  if (context.aborted) return context;

  context = await runMiddlewarePipeline(stateUpdate, context);
  if (context.aborted) return context;

  context = await runMiddlewarePipeline(postProcess, context);

  return context;
}
