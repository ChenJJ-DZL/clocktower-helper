/**
 * 猎人（Huntsman）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你可以追捕一名指定玩家。"
 *
 * 每夜选择一名玩家作为追捕目标。
 * allowSelf: false — 不能追捕自己
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
  if (targetId == null)
    return { ...ctx, aborted: true, abortReason: "未选择目标" };
  const target = ctx.snapshot.seats.find((s: any) => s.id === targetId);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        targetRole: target?.roleId ?? target?.role?.id ?? "unknown",
        huntsmanId: ctx.actionNode.seatId,
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
        huntsman: r,
      },
    },
    meta: { ...ctx.meta, huntsmanResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[猎人] ${ctx.actionNode.seatId + 1}号 追捕 ${r.targetId + 1}号`
      : "[猎人] 未选择目标";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【猎人】，选择一名玩家追捕。`,
      abilityLog: log,
    },
  };
};

export const huntsmanAbility = createRoleAbility({
  roleId: "huntsman",
  abilityId: "huntsman_night",
  abilityName: "猎人",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 51,
  otherNightPriority: 88,
  firstNightOnly: false,
  wakePromptId: "role.huntsman.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
