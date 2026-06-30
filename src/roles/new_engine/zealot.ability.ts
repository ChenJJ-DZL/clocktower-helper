/**
 * 狂热者（Zealot）新引擎技能实现
 *
 * 【角色能力】"你必须在每次投票时都投票，否则你可能死亡。"
 *
 * 被动检测狂热者每日的投票行为。每次提名阶段若存活但未投票，
 * 标记 diesIfNotVoted，由上层逻辑判定是否触发死亡。
 * 狂热者死亡后不再受此约束。
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
  if (!seat?.isAlive)
    return { ...ctx, aborted: true, abortReason: "已死亡，无需投票" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 从 meta 中读取当前提名阶段的投票记录
  const zealotVoted =
    ctx.meta.zealotVoted === true ||
    ctx.meta.nominationVotes?.[ctx.actionNode.seatId] === true;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        mustVote: true,
        hasVoted: zealotVoted,
        diesIfNotVoted: !zealotVoted,
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
      zealotVoteStatus: {
        day: ctx.snapshot.nightCount ?? 0,
        voted: r?.hasVoted ?? false,
      },
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        zealot: r,
      },
    },
    meta: { ...ctx.meta, zealotResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const status = r?.hasVoted ? "已投票 ✓" : "未投票 → 可能死亡";
  const log = `[狂热者] ${status}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "检测狂热者投票状态。",
      abilityLog: log,
    },
  };
};

export const zealotAbility = createRoleAbility({
  roleId: "zealot",
  abilityId: "zealot_vote",
  abilityName: "狂热投票",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
