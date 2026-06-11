/**
 * 谜题大师（Puzzlemaster）新引擎技能实现
 *
 * 【角色能力】"一名玩家醉酒（即使你已死亡）。每局限一次，白天猜是谁。猜对则解除醉酒。"
 *
 * 谜题大师使一名玩家进入醉酒状态。白天可猜测是谁被醉酒，猜对则解除。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const guessSeat = ctx.storytellerInput?.guessSeatId ?? null;
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityResult: { guessSeat, correct: false } },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  return {
    ...ctx,
    meta: { ...ctx.meta, puzzlemasterResult: ctx.meta.abilityResult },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  console.log("[Puzzlemaster] 谜题大师触发");
  return ctx;
};

export const puzzlemasterAbility = createRoleAbility({
  roleId: "puzzlemaster",
  abilityId: "puzzlemaster_guess",
  abilityName: "解谜猜测",
  triggerTiming: [AbilityTriggerTiming.DAY],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.puzzlemaster.wake",
  targetConfig: { min: 1, max: 1, allowSelf: true, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
