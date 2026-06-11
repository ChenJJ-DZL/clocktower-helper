/**
 * 黎明（Dawn）新引擎技能实现
 *
 * 【角色能力】"被动：游戏流程标记，表示白天开始。"
 *
 * 标记游戏进入白天阶段。用于触发器排序和流程控制。
 * allowSelf: false — 无需选择目标
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        phase: "dawn",
        dayNumber: (ctx.snapshot as any).dayNumber ?? 1,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      phase: "dawn",
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        dawn: r,
      },
    },
    meta: { ...ctx.meta, dawnResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const log = `[黎明] 第${(ctx.snapshot as any).dayNumber ?? 1}天开始`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "黎明降临，新的一天开始了。",
      abilityLog: log,
    },
  };
};

export const dawnAbility = createRoleAbility({
  roleId: "dawn",
  abilityId: "dawn_phase",
  abilityName: "黎明",
  triggerTiming: [
    AbilityTriggerTiming.FIRST_NIGHT,
    AbilityTriggerTiming.EVERY_NIGHT,
  ],
  wakePriority: 1,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
