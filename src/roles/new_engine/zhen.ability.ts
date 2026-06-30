/**
 * 甄（Zhen）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你可以查验一名玩家的身份。"
 *
 * 每夜选择一名玩家，查验其真实角色或阵营信息（侦探能力）。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  const target = ctx.snapshot.seats.find((s: any) => s.id === targetId);
  const roleName = target?.role?.name ?? "未知";
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityResult: { targetId, roleName } },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return { ...ctx, meta: { ...ctx.meta, zhenResult: r } };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[Zhen] 甄查验了${(r?.targetId ?? -1) + 1}号：${r?.roleName ?? "未知"}`;
  console.log(log);
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log } };
};

export const zhenAbility = createRoleAbility({
  roleId: "zhen",
  abilityId: "zhen_investigate",
  abilityName: "侦探查验",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.zhen.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
