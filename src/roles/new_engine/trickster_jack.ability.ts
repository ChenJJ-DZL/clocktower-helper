/**
 * 恶作剧杰克（Trickster Jack）新引擎技能实现
 *
 * 【角色能力】"被处决时随机与一人交换角色。"
 *
 * 当恶作剧杰克被处决时，随机选择一名存活玩家与之交换角色。
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
  const aliveOthers = ctx.snapshot.seats.filter(
    (s: any) => s.isAlive && s.id !== ctx.actionNode.seatId
  );
  const targetId =
    aliveOthers.length > 0
      ? aliveOthers[Math.floor(Math.random() * aliveOthers.length)].id
      : null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        tricksterActive: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.tricksterActive) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        tricksterJack: r,
      },
    },
    meta: { ...ctx.meta, tricksterResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[恶作剧杰克] 与${r.targetId + 1}号交换角色`
      : "[恶作剧杰克] 无目标可交换";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `【恶作剧杰克】被处决，随机与${r?.targetId != null ? `${r.targetId + 1}号` : "一名玩家"}交换角色。`,
      abilityLog: log,
    },
  };
};

export const trickster_jackAbility = createRoleAbility({
  roleId: "trickster_jack",
  abilityId: "trickster_jack_passive",
  abilityName: "恶作剧杰克",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
