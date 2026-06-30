/**
 * 理发师（Barber）新引擎技能实现
 *
 * 【角色能力】"如果你在夜晚死亡，你可以交换两名玩家的角色。"
 *
 * PASSIVE 触发：夜晚死亡时触发，可交换两名玩家角色。
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
  if (!seat) return ctx;
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const swapA = ctx.storytellerInput?.swapA ?? null;
  const swapB = ctx.storytellerInput?.swapB ?? null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        barberDied: true,
        swapA,
        swapB,
        swapped: swapA !== null && swapB !== null,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.swapped) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      barberSwap: { a: r.swapA, b: r.swapB },
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        barber: r,
      },
    },
    meta: { ...ctx.meta, barberResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (r?.swapped)
    console.log(`[理发师] 交换 ${r.swapA + 1}号 和 ${r.swapB + 1}号角色`);
  else console.log("[理发师] 理发师死亡但未交换角色");
  return ctx;
};

export const barberAbility = createRoleAbility({
  roleId: "barber",
  abilityId: "barber_swap",
  abilityName: "角色交换",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: 78,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
