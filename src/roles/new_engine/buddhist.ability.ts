/**
 * 佛教徒（Buddhist）新引擎技能实现
 *
 * 【角色能力】"每天一次，你可以保护一名玩家免受伤害。"
 *
 * 佛教徒每天可以选择一名玩家进行保护，使其免疫当天的死亡效果。
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
  const effects =
    ctx.snapshot.seats.find((s: any) => s.id === targetId)?.statusEffects ?? [];
  const isDrunk = effects.some(
    (e: any) => e.type === "drunk" || e.type === "poisoned"
  );
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: { targetId, protected: true, isDrunk },
    },
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
        buddhist: r,
      },
    },
    meta: { ...ctx.meta, buddhistResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[Buddhist] 佛教徒保护了${(r?.targetId ?? -1) + 1}号玩家`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【佛教徒】，选择一名玩家保护。`,
    },
  };
};

export const buddhistAbility = createRoleAbility({
  roleId: "buddhist",
  abilityId: "buddhist_protect",
  abilityName: "佛法庇护",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.buddhist.wake",
  targetConfig: { min: 1, max: 1, allowSelf: true, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
