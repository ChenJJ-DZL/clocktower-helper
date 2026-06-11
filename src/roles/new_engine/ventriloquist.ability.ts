/**
 * 腹语师（Ventriloquist）新引擎技能实现
 *
 * 【角色能力】"可以让被处决者说出遗言。"
 *
 * 当有玩家被处决时，腹语师可以代替该玩家说出遗言（或修改其遗言内容）。
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
  const executedId =
    ctx.storytellerInput?.executedId ??
    (ctx.snapshot as any).lastExecutedId ??
    null;
  const message =
    ctx.storytellerInput?.message ?? (ctx.actionNode as any).message ?? null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        executedId,
        message,
        ventriloquistActive: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.ventriloquistActive) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      ventriloquistMessage: r.message
        ? { [r.executedId]: r.message }
        : undefined,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        ventriloquist: r,
      },
    },
    meta: { ...ctx.meta, ventriloquistResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.executedId != null
      ? `[腹语师] 代${r.executedId + 1}号说出遗言`
      : "[腹语师] 无目标";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "【腹语师】被处决者产生，选择是否代为说出遗言。",
      abilityLog: log,
    },
  };
};

export const ventriloquistAbility = createRoleAbility({
  roleId: "ventriloquist",
  abilityId: "ventriloquist_passive",
  abilityName: "腹语师",
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
