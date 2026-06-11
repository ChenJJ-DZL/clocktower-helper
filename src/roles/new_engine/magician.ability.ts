/**
 * 魔术师（Magician）新引擎技能实现
 *
 * 【角色能力】"恶魔以为你是邪恶阵营。"
 *
 * 被动能力：魔术师向恶魔注册为邪恶阵营。
 * 恶魔（及其相关能力）在探查或感知阵营时，会将魔术师视为邪恶。
 * 不主动唤醒，持续生效。
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
        magicianActive: true,
        registersAsEvil: true,
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
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        magician: r,
      },
    },
    meta: { ...ctx.meta, magicianResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const log = "[Magician] 魔术师在场 — 向恶魔注册为邪恶阵营";
  console.log(log);
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityLog: log },
  };
};

export const magicianAbility = createRoleAbility({
  roleId: "magician",
  abilityId: "magician_passive",
  abilityName: "魔术师",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
