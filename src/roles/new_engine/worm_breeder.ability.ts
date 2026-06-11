/**
 * 蠕虫培育者（Worm Breeder）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你可以选择一名玩家在其体内下虫卵。"
 *
 * 每夜选择一名活着的玩家下虫卵，被下虫卵的玩家在某个时机触发额外效果。
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
    meta: { ...ctx.meta, abilityResult: { targetId, eggsLaid: true } },
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
        wormBreeder: r,
      },
    },
    meta: { ...ctx.meta, wormBreederResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[WormBreeder] 蠕虫培育者对${(r?.targetId ?? -1) + 1}号下了虫卵`;
  console.log(log);
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log } };
};

export const wormBreederAbility = createRoleAbility({
  roleId: "worm_breeder",
  abilityId: "worm_breeder_eggs",
  abilityName: "虫卵寄生",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 30,
  firstNightOnly: false,
  wakePromptId: "role.worm_breeder.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
