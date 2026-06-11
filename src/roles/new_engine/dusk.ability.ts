/**
 * 黄昏（Dusk）新引擎技能实现
 *
 * 【角色能力】"被动：游戏流程标记，表示夜晚开始。"
 *
 * 标记游戏进入夜晚阶段。用于触发器排序和流程控制。
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
        phase: "dusk",
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
      phase: "dusk",
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        dusk: r,
      },
    },
    meta: { ...ctx.meta, duskResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const log = `[黄昏] 第${(ctx.snapshot as any).dayNumber ?? 1}天夜晚来临`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "黄昏降临，夜晚即将开始。",
      abilityLog: log,
    },
  };
};

export const duskAbility = createRoleAbility({
  roleId: "dusk",
  abilityId: "dusk_phase",
  abilityName: "黄昏",
  triggerTiming: [
    AbilityTriggerTiming.FIRST_NIGHT,
    AbilityTriggerTiming.EVERY_NIGHT,
  ],
  wakePriority: 99,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
