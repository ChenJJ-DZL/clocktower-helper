/**
 * 经纪人（Broker）新引擎技能实现
 *
 * 【角色能力】"每夜可以选择两名玩家交换手中的信息。"
 *
 * 每夜选择两名玩家，交换他们手中的信息或角色情报。
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
  const t1 = ctx.targetIds?.[0] ?? null;
  const t2 = ctx.targetIds?.[1] ?? null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        swapA: t1,
        swapB: t2,
        swapped: t1 !== null && t2 !== null,
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
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        broker: r,
      },
    },
    meta: { ...ctx.meta, brokerResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (r?.swapped) {
    const log = `[Broker] 经纪人交换了${r.swapA + 1}号和${r.swapB + 1}号的信息`;
    console.log(log);
    return { ...ctx, meta: { ...ctx.meta, abilityLog: log } };
  }
  console.log("[Broker] 经纪人未进行交换");
  return ctx;
};

export const brokerAbility = createRoleAbility({
  roleId: "broker",
  abilityId: "broker_swap",
  abilityName: "信息交换",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.broker.wake",
  targetConfig: { min: 2, max: 2, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
