/**
 * 幽灵（Wraith）新引擎技能实现
 *
 * 【角色能力】"首夜，选择一名善良玩家。如果该玩家白天死亡，你获得其能力。"
 *
 * FIRST_NIGHT 触发，说书人选择一名善良玩家作为目标。
 * 记录 wraithTarget 到 snapshot，供白天死亡检测逻辑使用。
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
  const targetRole =
    targetId != null
      ? (ctx.snapshot.roleAssignments?.[targetId]?.id ?? null)
      : null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        targetRole,
        wraithTarget: targetId,
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
      wraithTarget: r.targetId,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        wraith: r,
      },
    },
    meta: { ...ctx.meta, wraithResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    "[幽灵] " +
    (r.targetId != null
      ? "目标: " + (r.targetId + 1) + " 号 (" + (r.targetRole ?? "未知") + ")"
      : "未选择目标");
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt:
        "唤醒" +
        (ctx.actionNode.seatId + 1) +
        "号【幽灵】，选择一名善良玩家作为目标。",
      abilityLog: log,
    },
  };
};

export const wraithAbility = createRoleAbility({
  roleId: "wraith",
  abilityId: "wraith_night",
  abilityName: "幽灵",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: 3,
  otherNightPriority: 2,
  firstNightOnly: true,
  wakePromptId: "role.wraith.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
