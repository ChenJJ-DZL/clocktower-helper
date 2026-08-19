/**
 * 佛吉（Fibbin）寓言角色实现
 *
 * 【角色能力】每局一次，说书人可以给善良玩家提供一条错误信息。
 * 被动触发，说书人决定何时使用。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const calculate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const used = (ctx.snapshot as any).fibbinUsed ?? false;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        fibbinActive: true,
        used,
        canUse: !used,
      },
    },
  };
};

const stateUpdate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      fibbinActive: true,
      fibbinUsed: r?.used ?? false,
    },
    meta: { ...ctx.meta, fibbinResult: r },
  };
};

export const fibbinAbility = createRoleAbility({
  roleId: "fibbin",
  abilityId: "fibbin_passive",
  abilityName: "佛吉",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  otherNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [],
});
