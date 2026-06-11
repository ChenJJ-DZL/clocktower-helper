/**
 * 星咒（Jinx Star）新引擎技能实现
 *
 * 【角色能力】"游戏开始时激活，影响特定角色组合。"
 *
 * 游戏开始时被动激活，记录并管理特定角色之间的相克（jinx）关系。
 * 不主动唤醒，由说书人在游戏准备阶段使用。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const jinxPairs: Array<{
    roleA: string;
    roleB: string;
    description: string;
  }> = ctx.storytellerInput?.jinxPairs ?? [];

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        jinxActive: true,
        jinxPairs,
        activatedAt: Date.now(),
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
      jinxStarActive: true,
      jinxPairs: r?.jinxPairs ?? [],
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        jinx_star: r,
      },
    },
    meta: { ...ctx.meta, jinxStarResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const pairCount = r?.jinxPairs?.length ?? 0;
  const log = `[JinxStar] 星咒已激活，${pairCount} 组相克规则生效`;
  console.log(log);
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityLog: log },
  };
};

export const jinx_starAbility = createRoleAbility({
  roleId: "jinx_star",
  abilityId: "jinx_star_passive",
  abilityName: "星咒",
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
