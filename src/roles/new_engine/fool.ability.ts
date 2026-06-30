/**
 * 愚人（Fool）新引擎技能实现
 *
 * 【角色能力】"首次被处决时，你不会死亡。"
 *
 * PASSIVE 触发：首次被处决时免死，并在 snapshot 中记录保护已使用。
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
  if (seat.isDead) return { ...ctx, aborted: true, abortReason: "已死亡" };
  if ((ctx.snapshot as any).firstExecutionProtected) {
    return { ...ctx, aborted: true, abortReason: "首次免死已使用" };
  }
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityResult: { firstExecutionProtected: true } },
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
      firstExecutionProtected: true,
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
  const log = "[愚人] 首次被处决，免死";
  console.log(log);
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityLog: log, prompt: "愚人首次被处决不会死亡" },
  };
};

export const foolAbility = createRoleAbility({
  roleId: "fool",
  abilityId: "fool_execution_save",
  abilityName: "首次处决免死",
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
