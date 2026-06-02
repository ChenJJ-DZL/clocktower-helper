/**
 * 演员（Actor）新引擎技能实现
 *
 * 【角色能力】"如果有一名善良玩家在白天被处决，当夜你变成该角色。"
 *
 * PASSIVE 触发：白天有善良玩家被处决时，当夜转换角色。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find((s: any) => s.id === ctx.actionNode.seatId);
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};

const calculate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const executedToday = ctx.snapshot.executedToday ?? null;
  const executedSeat = executedToday != null ? ctx.snapshot.seats.find((s: any) => s.id === executedToday) : null;
  const isGood = executedSeat?.role?.type === "townsfolk" || executedSeat?.role?.type === "outsider";

  return {
    ...ctx, meta: {
      ...ctx.meta, abilityResult: {
        actorTransformed: isGood,
        transformsInto: isGood ? executedSeat!.role!.id : null,
        originalRole: executedSeat?.role?.name ?? null,
      },
    },
  };
};

const stateUpdate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.actorTransformed) return ctx;
  return {
    ...ctx,
    snapshot: { ...ctx.snapshot, _abilityResults: { ...((ctx.snapshot as any)._abilityResults ?? {}), actor: r } },
    meta: { ...ctx.meta, actorResult: r },
  };
};

const postProcess = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = r?.actorTransformed
    ? `[Actor] 演员变成被处决的善良角色: ${r.originalRole}`
    : "[Actor] 被处决者非善良或无处决";
  console.log(log);
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log } };
};

export const actorAbility = createRoleAbility({
  roleId: "actor", abilityId: "actor_transform", abilityName: "角色转换",
  triggerTiming: [AbilityTriggerTiming.PASSIVE], wakePriority: 0, firstNightOnly: false,
  wakePromptId: "", targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck], calculate: [calculate], stateUpdate: [stateUpdate], postProcess: [postProcess],
});
