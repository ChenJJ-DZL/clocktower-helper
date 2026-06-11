/**
 * 官僚（Bureaucrat）新引擎技能实现
 *
 * 【角色能力】"每夜选择除你以外的一名玩家，明天白天他的投票算作三票。"
 *
 * 每夜选择一名玩家（非自己），次日白天其投票计为三票。
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
        tripleVote: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.targetId) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      tripleVote: {
        ...((ctx.snapshot as any).tripleVote ?? {}),
        [r.targetId]: true,
      },
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        bureaucrat: r,
      },
    },
    meta: { ...ctx.meta, bureaucratResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[官僚] ${r.targetId + 1}号明天白天投票计为三票`
      : "[官僚] 未行动";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【官僚】，选择一名玩家（除自己外）使其明天投票计为三票。`,
      abilityLog: log,
    },
  };
};

export const bureaucratAbility = createRoleAbility({
  roleId: "bureaucrat",
  abilityId: "bureaucrat_vote",
  abilityName: "三倍选票",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 25,
  firstNightOnly: false,
  wakePromptId: "role.bureaucrat.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
