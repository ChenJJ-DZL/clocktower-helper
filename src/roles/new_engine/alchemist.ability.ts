/**
 * 炼金术师（Alchemist）新引擎技能实现
 *
 * 【角色能力】"首夜，你获得一个不在场爪牙的能力。"
 *
 * 首夜获得一个不在场爪牙的能力，由说书人决定。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find((s: any) => s.id === ctx.actionNode.seatId);
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};

const calculate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const grantedAbility = ctx.storytellerInput?.minionAbility ?? "无";
  return {
    ...ctx, meta: {
      ...ctx.meta, abilityResult: { grantedAbility, alchemistActive: true },
    },
  };
};

const stateUpdate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.alchemistActive) return ctx;
  return {
    ...ctx,
    snapshot: { ...ctx.snapshot, _abilityResults: { ...((ctx.snapshot as any)._abilityResults ?? {}), alchemist: r } },
    meta: { ...ctx.meta, alchemistResult: r },
  };
};

const postProcess = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  console.log(`[Alchemist] 获得爪牙能力: ${ctx.meta.abilityResult?.grantedAbility ?? "无"}`);
  return { ...ctx, meta: { ...ctx.meta, abilityLog: "炼金术师获得爪牙能力" } };
};

export const alchemistAbility = createRoleAbility({
  roleId: "alchemist", abilityId: "alchemist_grant", abilityName: "爪牙之力",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT], wakePriority: 50, firstNightOnly: true,
  wakePromptId: "role.alchemist.wake", targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck], calculate: [calculate], stateUpdate: [stateUpdate], postProcess: [postProcess],
});
