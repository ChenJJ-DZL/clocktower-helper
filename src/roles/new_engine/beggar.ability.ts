/**
 * 乞丐（Beggar）新引擎技能实现
 *
 * 【角色能力】"你不能投票。每天可请求一名玩家给你投票权，他同意则你获其投票权。"
 *
 * 每天选择一名玩家请求投票权。对方同意后，本日投票时乞丐可使用该玩家的投票权。
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
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        granted: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.granted) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      beggarVoteSource: r.targetId,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        beggar: r,
      },
    },
    meta: { ...ctx.meta, beggarResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[乞丐] 从${r.targetId + 1}号获得投票权`
      : "[乞丐] 未行动";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【乞丐】，选择一名玩家请求投票权。`,
      abilityLog: log,
    },
  };
};

export const beggarAbility = createRoleAbility({
  roleId: "beggar",
  abilityId: "beggar_vote",
  abilityName: "乞讨选票",
  triggerTiming: [AbilityTriggerTiming.DAY],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.beggar.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
