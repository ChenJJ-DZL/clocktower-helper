/** 学者（Scholar）新引擎技能实现\n * 【角色能力】"学习一名玩家的能力。" */
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
    meta: { ...ctx.meta, abilityResult: { targetId: t, learned: t !== null } },
  };
};
const su = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return {
    ...ctx,
    meta: { ...ctx.meta, scholarResult: ctx.meta.abilityResult },
  };
};
const pp = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  console.log(
    r?.learned ? `[Scholar] 学习${r.targetId + 1}号` : "[Scholar] 未学习"
  );
  return ctx;
};
export const scholarAbility = createRoleAbility({
  roleId: "scholar",
  abilityId: "scholar_learn",
  abilityName: "学者",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [pc],
  calculate: [calc],
  stateUpdate: [su],
  postProcess: [pp],
});
