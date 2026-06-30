/** 级长（Prefect）新引擎技能实现\n * 【角色能力】"管理投票秩序，被提名时可额外投票。" */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const pc = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return ctx;
};
const calc = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityResult: { prefectActive: true } },
  };
};
const su = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return {
    ...ctx,
    meta: { ...ctx.meta, prefectResult: ctx.meta.abilityResult },
  };
};
const pp = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  console.log("[Prefect] 级长");
  return ctx;
};
export const prefectAbility = createRoleAbility({
  roleId: "prefect",
  abilityId: "prefect_passive",
  abilityName: "级长",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [pc],
  calculate: [calc],
  stateUpdate: [su],
  postProcess: [pp],
});
