/**
 * 矿工（Miner）新引擎技能实现
 *
 * 【角色能力】"可以在地下行动，不容易被察觉。"
 *
 * 被动能力：矿工处于"地下"隐藏状态，不易被探查类角色发现。
 * 在信息类角色（如占卜师、调查员等）的探查结果中，矿工不会被正确识别。
 * 持续生效，不主动唤醒。
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
        minerActive: true,
        isUnderground: true,
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
      minerActive: true,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        miner: r,
      },
    },
    meta: { ...ctx.meta, minerResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const log = "[Miner] 矿工在地下行动，不易被察觉";
  console.log(log);
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityLog: log },
  };
};

export const minerAbility = createRoleAbility({
  roleId: "miner",
  abilityId: "miner_passive",
  abilityName: "矿工",
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
