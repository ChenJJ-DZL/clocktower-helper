/**
 * 无神论者（Atheist）新引擎技能实现（实验角色）
 *
 * 【角色能力】"如果善良阵营获胜，邪恶阵营获胜；如果邪恶阵营获胜，善良阵营获胜。
 *   只要无神论者可能在场，说书人可以做任何事，即使这违反了其他规则。"
 *
 * PASSIVE 触发：游戏结束时触发，反转胜利条件。
 * 注意：无神论者的存在意味着说书人可以在游戏中做任何事，
 * 这使得该角色的实现需要引擎层面支持胜利条件反转。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find((s: any) => s.id === ctx.actionNode.seatId);
  if (!seat) return { ...ctx, aborted: true, abortReason: "未找到座位" };
  return ctx;
};

const calculate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return {
    ...ctx, meta: {
      ...ctx.meta, abilityResult: {
        atheistInPlay: true,
        invertWinCondition: true,
      },
    },
  };
};

const stateUpdate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    meta: { ...ctx.meta, atheistResult: r },
    snapshot: {
      ...ctx.snapshot,
      atheistInPlay: true,
      _abilityResults: { ...((ctx.snapshot as any)._abilityResults ?? {}), atheist: r },
    },
  };
};

const postProcess = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const log = "[Atheist] 无神论者在场，胜利条件反转";
  console.log(log);
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log, prompt: "无神论者在场，游戏胜利条件反转。请引擎处理反转胜利条件。" } };
};

export const atheistAbility = createRoleAbility({
  roleId: "atheist", abilityId: "atheist_win_invert", abilityName: "无神领域",
  triggerTiming: [AbilityTriggerTiming.PASSIVE], wakePriority: 0, firstNightOnly: false, wakePromptId: "role.atheist.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck], calculate: [calculate], stateUpdate: [stateUpdate], postProcess: [postProcess],
});
