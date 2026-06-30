/**
 * 巫师（Wizard）新引擎技能实现
 *
 * 【角色能力】"每局限一次，你可以施展一道法术。"
 *
 * 巫师每局游戏可使用一次法术能力，由说书人根据法术效果执行对应操作。
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
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityResult: { spellCast: true, used: true } },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  return {
    ...ctx,
    meta: { ...ctx.meta, wizardResult: ctx.meta.abilityResult },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  console.log("[Wizard] 巫师施展了法术");
  return ctx;
};

export const wizardAbility = createRoleAbility({
  roleId: "wizard",
  abilityId: "wizard_spell",
  abilityName: "法术施展",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: 33,
  otherNightPriority: 16,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
