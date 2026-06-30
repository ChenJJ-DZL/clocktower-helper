/** 歌手（Singer）新引擎技能实现\n * 【角色能力】"你的声音可以影响他人。" */
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
    meta: {
      ...ctx.meta,
      abilityResult: { singerActive: true, volume: "high" },
    },
  };
};
const su = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return {
    ...ctx,
    meta: { ...ctx.meta, singerResult: ctx.meta.abilityResult },
  };
};
const pp = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  console.log("[Singer] 歌手之声");
  return ctx;
};
export const singerAbility = createRoleAbility({
  roleId: "singer",
  abilityId: "singer_voice",
  abilityName: "歌手",
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
