/**
 * 外来者（Outsider）新引擎技能实现（占位角色）
 *
 * 【角色能力】"占位角色，无特殊能力。"
 *
 * 外来者模板角色，没有任何特殊能力。
 * 作为游戏设置中外来者数量的占位符使用。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        outsiderPlaceholder: true,
        hasNoAbility: true,
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
    meta: { ...ctx.meta, outsiderResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  console.log("[Outsider] 外来者占位角色，无特殊能力");
  return ctx;
};

export const outsiderAbility = createRoleAbility({
  roleId: "outsider",
  abilityId: "outsider_placeholder",
  abilityName: "外来者",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
