/**
 * 精神病患者（Psychopath）新引擎技能实现
 *
 * 【角色能力】"每个白天，在提名开始前，你可以公开选择一名玩家：他死亡。"
 *
 * DAY 触发，选择一个目标使其死亡。
 * targetConfig: min:1, max:1
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
        killed: targetId != null,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = ctx;
  const r = meta.abilityResult as any;

  if (!r?.killed) return ctx;

  const newSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat: any) => {
      if (seat.id === r.targetId) {
        return {
          ...seat,
          isAlive: false,
          isDead: true,
          deathSource: "psychopath_kill",
          deathSourceSeatId: actionNode.seatId,
        };
      }
      return seat;
    }),
  };

  return {
    ...ctx,
    snapshot: newSnapshot,
    meta: {
      ...ctx.meta,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        psychopath: r,
      },
    },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, actionNode } = ctx;
  const r = meta.abilityResult as any;

  const log = r?.killed
    ? `[Psychopath] 精神病患者（${actionNode.seatId + 1}号）公开杀死了${r.targetId + 1}号`
    : "[Psychopath] 未行动";

  console.log(log);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${actionNode.seatId + 1}号【精神病患者】，公开选择一名玩家杀死。`,
      abilityLog: log,
    },
  };
};

export const psychopathAbility = createRoleAbility({
  roleId: "psychopath",
  abilityId: "psychopath_day_kill",
  abilityName: "公开处刑",
  triggerTiming: [AbilityTriggerTiming.DAY],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.psychopath.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
