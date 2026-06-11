/**
 * 枪手（Gunslinger）新引擎技能实现
 *
 * 【角色能力】"可以在白天射击一名玩家。"
 *
 * 白天选择一名玩家射击，该玩家立即死亡。
 * 枪手可以在白天任意时刻发动。
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
        shot: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.shot) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      gunslingerShot: r.targetId,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        gunslinger: r,
      },
    },
    meta: { ...ctx.meta, gunslingerResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.shot && r?.targetId != null
      ? `[枪手] 射击${r.targetId + 1}号`
      : "[枪手] 未射击";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【枪手】，选择一名玩家射击。`,
      abilityLog: log,
    },
  };
};

export const gunslingerAbility = createRoleAbility({
  roleId: "gunslinger",
  abilityId: "gunslinger_shot",
  abilityName: "精准射击",
  triggerTiming: [AbilityTriggerTiming.DAY],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.gunslinger.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
