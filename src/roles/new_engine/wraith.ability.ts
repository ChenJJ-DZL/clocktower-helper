/**
 * 亡魂 / 幽灵（Wraith）新引擎技能实现
 *
 * 【官方角色能力】"你可以在夜晚睁眼。当其他邪恶玩家被唤醒时，你也会被唤醒。"
 *
 * 亡魂不主动选人。当说书人唤醒其他邪恶玩家时，将亡魂与邪恶玩家共同唤醒。
 * targetConfig: min: 0, max: 0
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
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
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        isWraithAwake: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        wraith: { active: true },
      },
    },
    meta: { ...ctx.meta, wraithResult: { active: true } },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const log = `[亡魂/幽灵] 亡魂在场，可随其他邪恶玩家一同睁眼。`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【亡魂/幽灵】，提醒其可在其他邪恶玩家行动时睁眼。`,
      abilityLog: log,
      displayInfo: {
        type: "info",
        log,
      },
    },
  };
};

export const wraithAbility = createRoleAbility({
  roleId: "wraith",
  abilityId: "wraith_night",
  abilityName: "亡魂",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT, AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 3,
  otherNightPriority: 2,
  firstNightOnly: false,
  wakePromptId: "role.wraith.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
