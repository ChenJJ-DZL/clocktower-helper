/** 暴乱（Riot）新引擎技能实现\n * 【角色能力】"每天必须有人被处决，否则随机死亡。" */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const pc = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return ctx;
};
const calc = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return { ...ctx, meta: { ...ctx.meta, abilityResult: { riotActive: true } } };
};
const su = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return { ...ctx, meta: { ...ctx.meta, riotResult: ctx.meta.abilityResult } };
};
const pp = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  console.log("[Riot] 暴乱");
  return ctx;
};
export const riotAbility = createRoleAbility({
  roleId: "riot",
  abilityId: "riot_passive",
  abilityName: "暴乱",
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
