/**
 * 狐妖（Fox Spirit）新引擎技能实现
 *
 * 【角色能力】"每夜，选择一名玩家。该玩家如被邪恶方提名且死亡，你不知道自己已死。"
 *
 * 自定义角色，PASSIVE 触发，记录狐妖目标
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
  const targetId =
    ctx.targetIds?.[0] ??
    ctx.actionNode.targetIds?.[0] ??
    ctx.storytellerInput?.foxTarget ??
    null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: { foxTarget: targetId, foxActive: true },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.foxTarget) return { ...ctx, meta: { ...ctx.meta, foxResult: r } };
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      foxTarget: r.foxTarget,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        fox_spirit: r,
      },
    },
    meta: { ...ctx.meta, foxResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.foxTarget != null
      ? `[狐妖] ${r.foxTarget + 1}号被标记为狐妖目标`
      : "[狐妖] 未选择目标";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
    },
  };
};

export const fox_spiritAbility = createRoleAbility({
  roleId: "fox_spirit",
  abilityId: "fox_charm",
  abilityName: "狐妖",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
