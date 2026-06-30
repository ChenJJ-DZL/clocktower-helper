/**
 * 玩具匠（Toymaker）新引擎技能实现
 *
 * 【角色能力】"游戏开始时，选择一名玩家获得玩具。"
 *
 * 游戏开始时选择一名玩家，该玩家获得一个玩具（特殊标记），效果由说书人自定义。
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
  const targetId =
    ctx.storytellerInput?.targetId ?? ctx.actionNode.targetIds?.[0] ?? null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        toymakerActive: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.toymakerActive || r?.targetId == null) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      toymakerTargets: [
        ...((ctx.snapshot as any).toymakerTargets ?? []),
        r.targetId,
      ],
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        toymaker: r,
      },
    },
    meta: { ...ctx.meta, toymakerResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[玩具匠] ${r.targetId + 1}号获得玩具`
      : "[玩具匠] 未选择目标";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【玩具匠】，选择一名玩家给予玩具。`,
      abilityLog: log,
    },
  };
};

export const toymakerAbility = createRoleAbility({
  roleId: "toymaker",
  abilityId: "toymaker_passive",
  abilityName: "玩具匠",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: true,
  wakePromptId: "role.toymaker.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
