/**
 * 中间件管道
 * 技能执行的标准流程抽象，实现职责链模式，支持灵活扩展中间件
 */

import { abilityPriorityCalculation } from "./abilityPriorityMiddleware";
import type {
  AbilityMiddlewareSet,
  CalculateMiddleware,
  MiddlewareContext,
  MiddlewareFunction,
  PostProcessMiddleware,
  PreCheckMiddleware,
  StateUpdateMiddleware,
} from "./middlewareTypes";

// 导出 abilityPriorityCalculation
export { abilityPriorityCalculation } from "./abilityPriorityMiddleware";
export type {
  AbilityMiddlewareSet,
  CalculateMiddleware,
  MiddlewareContext,
  MiddlewareFunction,
  PostProcessMiddleware,
  PreCheckMiddleware,
  StateUpdateMiddleware,
};

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
