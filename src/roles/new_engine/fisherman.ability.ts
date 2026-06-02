/**
 * 渔夫（Fisherman）新引擎技能实现
 *
 * 【角色能力】"每局游戏限一次，在白天时，你可以向说书人咨询以获得建议。"
 *
 * 白天限次能力。使用后标记已消耗。
 */
import { canUseLimitedAbility, consumeLimitedAbility } from "../../utils/LimitedAbilityManager";
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find((s: any) => s.id === ctx.actionNode.seatId);
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  if (!canUseLimitedAbility(ctx.actionNode.seatId, "fisherman_advice")) {
    return { ...ctx, aborted: true, abortReason: "渔夫已使用过能力" };
  }
  return ctx;
};

const calculate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  consumeLimitedAbility(ctx.actionNode.seatId, "fisherman_advice");
  const advice = ctx.storytellerInput?.advice ?? "说书人的建议";
  return { ...ctx, meta: { ...ctx.meta, abilityResult: { advice, used: true } } };
};

const stateUpdate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return { ...ctx, snapshot: { ...ctx.snapshot, _abilityResults: { ...((ctx.snapshot as any)._abilityResults ?? {}), fisherman: r } } };
};

const postProcess = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  console.log("[Fisherman] 渔夫向说书人寻求了建议");
  return { ...ctx, meta: { ...ctx.meta, abilityLog: "渔夫使用了能力", prompt: "渔夫向说书人寻求建议。" } };
};

export const fishermanAbility = createRoleAbility({
  roleId: "fisherman", abilityId: "fisherman_advice", abilityName: "渔夫咨询",
  triggerTiming: [AbilityTriggerTiming.DAY], wakePriority: 0, firstNightOnly: false,
  wakePromptId: "role.fisherman.wake", targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck], calculate: [calculate], stateUpdate: [stateUpdate], postProcess: [postProcess],
});
