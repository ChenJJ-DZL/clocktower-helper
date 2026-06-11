/**
 * 使节（Envoy）新引擎技能实现
 *
 * 【角色能力】"每局一次，你可以代替说书人宣布信息。"
 *
 * 每局游戏仅可使用一次。使节可以选择代替说书人宣布一条信息。
 * allowSelf: false — 无需选择目标
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
  // 检查是否已使用
  const used = (ctx.snapshot as any)._abilityResults?.envoy?.used ?? false;
  if (used) return { ...ctx, aborted: true, abortReason: "能力已使用" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const message = ctx.storytellerInput?.message ?? "(使节未宣布信息)";
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        used: true,
        message,
        announcedBy: ctx.actionNode.seatId,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        envoy: r,
      },
    },
    meta: { ...ctx.meta, envoyResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[使节] ${ctx.actionNode.seatId + 1}号 宣布: ${r?.message ?? "无"}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `${ctx.actionNode.seatId + 1}号【使节】将代替说书人宣布信息。`,
      abilityLog: log,
    },
  };
};

export const envoyAbility = createRoleAbility({
  roleId: "envoy",
  abilityId: "envoy_announce",
  abilityName: "使节",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.envoy.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
