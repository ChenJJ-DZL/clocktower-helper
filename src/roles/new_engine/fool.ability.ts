/**
 * 愚人（Fool）新引擎技能实现
 *
 * 【角色能力】"首次被处决时，你不会死亡。"
 *
 * PASSIVE 触发：首次被处决时免死，并在 snapshot 中记录保护已使用。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

import { canFoolSurvive } from "../../utils/bmrMechanics";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat) return ctx;
  if (seat.isDead) return { ...ctx, aborted: true, abortReason: "已死亡" };
  if (!canFoolSurvive(seat)) {
    return { ...ctx, aborted: true, abortReason: "弄臣首次免死已失效或已使用" };
  }
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
        survived: true,
        reason: "弄臣首次死亡免死生效",
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const foolSeatId = ctx.actionNode.seatId;

  const seats = ctx.snapshot.seats.map((seat: any) => {
    if (seat.id === foolSeatId) {
      return {
        ...seat,
        isAlive: true,
        isDead: false,
        foolUsed: true,
        hasUsedFoolAbility: true,
      };
    }
    return seat;
  });

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        fool: r,
      },
    },
    meta: { ...ctx.meta, foolResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const log = "[弄臣] 首次面临死亡，触发免死能力存活";
  console.log(log);
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityLog: log, prompt: "弄臣首次死亡不会死亡" },
  };
};

export const foolAbility = createRoleAbility({
  roleId: "fool",
  abilityId: "fool_first_death_save",
  abilityName: "首次免死",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.fool.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
