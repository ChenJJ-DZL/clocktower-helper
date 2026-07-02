/**
 * 中间件管道
 * 技能执行的标准流程抽象，实现职责链模式
 */

import { abilityPriorityCalculation } from "./abilityPriorityMiddleware";
import type {
  AbilityMiddlewareSet,
  MiddlewareContext,
} from "./middlewareTypes";

// 导出公共类型和工具
export { abilityPriorityCalculation } from "./abilityPriorityMiddleware";
export type {
  AbilityMiddlewareSet,
  CalculateMiddleware,
  MiddlewareContext,
  MiddlewareFunction,
  PostProcessMiddleware,
  PreCheckMiddleware,
  StateUpdateMiddleware,
} from "./middlewareTypes";

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
    if (context.aborted) break;
    context = await middleware(context);
  }
  return context;
}

/**
 * 执行完整的技能处理流程：preCheck → calculate（含优先级）→ stateUpdate → postProcess
 *
 * 预览模式（preview=true）：
 *   只执行 preCheck + calculate，生成预览结果；
 *   跳过 stateUpdate（不修改游戏状态）和 postProcess（不产生副作用）。
 *   调用方应通过返回的 meta 字段获取预览信息，展示确认弹窗。
 */
export async function runFullAbilityPipeline(
  middlewareSet: Partial<AbilityMiddlewareSet>,
  initialContext: MiddlewareContext
): Promise<MiddlewareContext> {
  const empty = async (ctx: MiddlewareContext) => ctx;
  const isPreview = !!initialContext.preview;

  const preCheck = middlewareSet.preCheck ?? [empty];
  const calculate = middlewareSet.calculate ?? [empty];
  const stateUpdate = middlewareSet.stateUpdate ?? [empty];
  const postProcess = middlewareSet.postProcess ?? [empty];

  // 注入全局优先级中间件到 calculate 阶段最前面
  const enhancedCalculate = [abilityPriorityCalculation, ...calculate];

  let ctx = await runMiddlewarePipeline(preCheck, initialContext);
  if (ctx.aborted) return ctx;

  ctx = await runMiddlewarePipeline(enhancedCalculate, ctx);
  if (ctx.aborted) return ctx;

  // 预览模式：跳过 stateUpdate 和 postProcess
  if (isPreview) {
    ctx.meta._pipelinePreview = true;
    return ctx;
  }

  ctx = await runMiddlewarePipeline(stateUpdate, ctx);
  if (ctx.aborted) return ctx;

  return runMiddlewarePipeline(postProcess, ctx);
}
