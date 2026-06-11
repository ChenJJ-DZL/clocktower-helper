/** 纹身师（SkinPainter）新引擎技能实现\n * 【角色能力】"每夜标记一名玩家。" */
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
    meta: { ...ctx.meta, abilityResult: { targetId: t, marked: t !== null } },
  };
};
const su = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return {
    ...ctx,
    meta: { ...ctx.meta, skinPainterResult: ctx.meta.abilityResult },
  };
};
const pp = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  console.log(
    r?.marked ? `[SkinPainter] 标记${r.targetId + 1}号` : "[SkinPainter] 未标记"
  );
  return ctx;
};
export const skin_painterAbility = createRoleAbility({
  roleId: "skin_painter",
  abilityId: "skin_painter_mark",
  abilityName: "纹身师",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 30,
  firstNightOnly: false,
  wakePromptId: "role.skin_painter.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [pc],
  calculate: [calc],
  stateUpdate: [su],
  postProcess: [pp],
});
