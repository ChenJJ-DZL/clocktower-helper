/**
 * 摆渡人（Ferryman）新引擎技能实现
 *
 * 【角色能力】"死亡时，可以将一名玩家复活。"
 *
 * 当摆渡人死亡时，可以选择一名已死亡的玩家将其复活。
 * allowDead: true — 目标可以是已死亡玩家。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const deadSeats = ctx.snapshot.seats.filter((s: any) => s.isDead && s.role);
  const targetId =
    ctx.storytellerInput?.targetId ??
    ctx.actionNode.targetIds?.[0] ??
    (deadSeats.length > 0
      ? deadSeats[Math.floor(Math.random() * deadSeats.length)].id
      : null);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        ferried: targetId !== null,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.ferried) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        ferryman: r,
      },
    },
    meta: { ...ctx.meta, ferrymanResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = r?.ferried
    ? `[摆渡人] 摆渡${r.targetId + 1}号复活`
    : "[摆渡人] 无目标可复活";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "【摆渡人】死亡触发，选择一名已死亡玩家复活。",
      abilityLog: log,
    },
  };
};

export const ferrymanAbility = createRoleAbility({
  roleId: "ferryman",
  abilityId: "ferryman_cross",
  abilityName: "灵魂摆渡",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.ferryman.wake",
  targetConfig: { min: 0, max: 1, allowSelf: false, allowDead: true },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
