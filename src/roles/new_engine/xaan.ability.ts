/**
 * 克桑（Xaan）新引擎技能实现
 *
 * 【角色能力】"己方爪牙的能力额外生效一晚。"
 *
 * 克桑使所有己方爪牙角色的能力持续时间延长一晚（即能力多生效一个夜晚）。
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
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityResult: { extraNightForMinions: true } },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  return { ...ctx, meta: { ...ctx.meta, xaanResult: ctx.meta.abilityResult } };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  console.log("[Xaan] 克桑：爪牙能力额外生效一晚");
  return ctx;
};

export const xaanAbility = createRoleAbility({
  roleId: "xaan",
  abilityId: "xaan_extra_night",
  abilityName: "暗夜延宕",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: 29,
  otherNightPriority: 12,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
