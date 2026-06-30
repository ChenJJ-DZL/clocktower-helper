/** 管家（Steward）新引擎技能实现\n * 【角色能力】"服务一名玩家，跟随其投票。" */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const pc = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const s = ctx.snapshot.seats.find((s: any) => s.id === ctx.actionNode.seatId);
  if (!s?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};
const calc = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const t = ctx.targetIds?.[0] ?? null;
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityResult: { masterId: t, serving: t !== null } },
  };
};
const su = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return {
    ...ctx,
    meta: { ...ctx.meta, stewardResult: ctx.meta.abilityResult },
  };
};
const pp = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  console.log(
    r?.serving ? `[Steward] 跟随${r.masterId + 1}号投票` : "[Steward] 未服务"
  );
  return ctx;
};
export const stewardAbility = createRoleAbility({
  roleId: "steward",
  abilityId: "steward_service",
  abilityName: "管家",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: 64,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [pc],
  calculate: [calc],
  stateUpdate: [su],
  postProcess: [pp],
});
