/**
 * 食人族（Cannibal）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你会得知今天被处决的玩家的角色。
 *   如果你处决了镇民，你会获得他的能力，直到下一次处决。"
 *
 * 每夜获取被处决者角色。如是镇民则获得其能力。
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
  const executedRole = executedSeat?.role?.name ?? "无";
  const isTownsfolk = executedSeat?.role?.type === "townsfolk";

  return {
    ...ctx, meta: {
      ...ctx.meta, abilityResult: {
        executedSeatId: executedToday,
        executedRole,
        gainedAbility: isTownsfolk ? executedSeat.role.id : null,
      },
    },
  };
};

const stateUpdate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    snapshot: { ...ctx.snapshot, _abilityResults: { ...((ctx.snapshot as any)._abilityResults ?? {}), cannibal: r } },
    meta: { ...ctx.meta, cannibalResult: r },
  };
};

const postProcess = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[Cannibal] 得知被处决者: ${r?.executedRole ?? "无"}${r?.gainedAbility ? " → 获得其能力" : ""}`;
  console.log(log);
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log, prompt: `唤醒${ctx.actionNode.seatId + 1}号【食人族】，告知被处决者角色。` } };
};

export const cannibalAbility = createRoleAbility({
  roleId: "cannibal", abilityId: "cannibal_nightly", abilityName: "吞噬能力",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT], wakePriority: 50, firstNightOnly: false,
  wakePromptId: "role.cannibal.wake", targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck], calculate: [calculate], stateUpdate: [stateUpdate], postProcess: [postProcess],
});
