/**
 * 顽皮孩子（Naughty Child）新引擎技能实现
 *
 * 【角色能力】"死亡时可以捣乱，影响游戏。"
 *
 * 被动能力：顽皮孩子死亡时触发捣乱效果。
 * 可以通过说书人手动配置捣乱类型（如散布虚假信息、干扰投票等）。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const mischiefType = ctx.storytellerInput?.mischiefType ?? "default";
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        naughtyChildActive: true,
        mischiefType,
        targetId,
        triggeredAt: Date.now(),
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
      naughtyChildActive: true,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        naughty_child: r,
      },
    },
    meta: { ...ctx.meta, naughtyChildResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const mischiefLabel = r?.mischiefType ?? "默认";
  const log = `[NaughtyChild] 顽皮孩子捣乱（${mischiefLabel}）`;
  console.log(log);
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityLog: log },
  };
};

export const naughty_childAbility = createRoleAbility({
  roleId: "naughty_child",
  abilityId: "naughty_child_passive",
  abilityName: "顽皮孩子",
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
