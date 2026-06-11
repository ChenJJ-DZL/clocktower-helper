/**
 * 恐惧散布者（Fearmonger）新引擎技能实现
 *
 * 【角色能力】"每个白天，选择一名玩家。如果恶魔被处决时该玩家还存活，邪恶获胜。"
 *
 * DAY 触发，选择一名玩家成为恐惧目标
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
    meta: { ...ctx.meta, abilityResult: { targetId, fearApplied: true } },
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
      fearTarget: r.targetId,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        fearmonger: r,
      },
    },
    meta: { ...ctx.meta, fearmongerResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[恐惧散布者] ${r.targetId + 1}号成为恐惧目标`
      : "[恐惧散布者] 未选择";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【恐惧散布者】，选择一名玩家散布恐惧。`,
      abilityLog: log,
    },
  };
};

export const fearmongerAbility = createRoleAbility({
  roleId: "fearmonger",
  abilityId: "fearmonger_fear",
  abilityName: "散布恐惧",
  triggerTiming: [AbilityTriggerTiming.DAY],
  wakePriority: 35,
  firstNightOnly: false,
  wakePromptId: "role.fearmonger.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
