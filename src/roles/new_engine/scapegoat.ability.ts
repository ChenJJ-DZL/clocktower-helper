/**
 * 替罪羊（Scapegoat）新引擎技能实现
 *
 * 【角色能力】"被处决时代替他人死亡。"
 *
 * 当替罪羊被处决时，说书人可以选择另一名玩家代替替罪羊死亡。
 * 替罪羊本身不会死亡。
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
        scapegoatActive: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.scapegoatActive) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      scapegoatTarget: r.targetId,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        scapegoat: r,
      },
    },
    meta: { ...ctx.meta, scapegoatResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[替罪羊] 代替${r.targetId + 1}号死亡`
      : "[替罪羊] 无替代目标";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "【替罪羊】被处决，选择一名玩家代替死亡。",
      abilityLog: log,
    },
  };
};

export const scapegoatAbility = createRoleAbility({
  roleId: "scapegoat",
  abilityId: "scapegoat_passive",
  abilityName: "替罪羊",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
