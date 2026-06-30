/**
 * 风暴捕手（Stormcatcher）新引擎技能实现
 *
 * 【角色能力】"选择一名玩家使其免于醉酒/中毒。"
 *
 * 游戏开始时选择一名玩家，该玩家在整个游戏中免疫醉酒和中毒效果。
 * 属于旅行者保护类能力。
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
        stormcatcherActive: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.stormcatcherActive || r?.targetId == null) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      protectedFromDrunk: [
        ...((ctx.snapshot as any).protectedFromDrunk ?? []),
        r.targetId,
      ],
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        stormcatcher: r,
      },
    },
    meta: { ...ctx.meta, stormcatcherResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[风暴捕手] ${r.targetId + 1}号获得醉酒/中毒免疫`
      : "[风暴捕手] 未选择目标";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【风暴捕手】，选择一名玩家使其免于醉酒/中毒。`,
      abilityLog: log,
    },
  };
};

export const stormcatcherAbility = createRoleAbility({
  roleId: "stormcatcher",
  abilityId: "stormcatcher_passive",
  abilityName: "风暴捕手",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.stormcatcher.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
