/** 修验者（Shugenja）新引擎技能实现\n * 【角色能力】"首夜，得知太阳方向（邪恶所在方向）。" */
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
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: { sunDirection: Math.random() < 0.5 ? "左" : "右" },
    },
  };
};
const su = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return {
    ...ctx,
    meta: { ...ctx.meta, shugenjaResult: ctx.meta.abilityResult },
  };
};
const pp = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  console.log(`[Shugenja] 太阳方向:${r?.sunDirection ?? "未知"}`);
  return ctx;
};
export const shugenjaAbility = createRoleAbility({
  roleId: "shugenja",
  abilityId: "shugenja_sun",
  abilityName: "修验者",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: 78,
  otherNightPriority: null,
  firstNightOnly: true,
  wakePromptId: "role.shugenja.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [pc],
  calculate: [calc],
  stateUpdate: [su],
  postProcess: [pp],
});
