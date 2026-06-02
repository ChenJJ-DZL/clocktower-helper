/**
 * 弄臣（Jester）新引擎技能实现
 *
 * 【角色能力】"如果你被处决，你单独获胜。"
 *
 * PASSIVE 触发：被处决时触发。
 * - 弄臣被处决后，弄臣玩家单独获胜（无论游戏结果如何）
 * - 需要游戏引擎在结算处决时特殊处理
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
        jesterExecuted: true,
        jesterWinsAlone: true,
      },
    },
  };
};

const stateUpdate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.jesterExecuted) return ctx;
  return {
    ...ctx,
    meta: { ...ctx.meta, jesterResult: r },
    snapshot: {
      ...ctx.snapshot,
      jesterExecuted: true,
      _abilityResults: { ...((ctx.snapshot as any)._abilityResults ?? {}), jester: r },
    },
  };
};

const postProcess = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const log = "[Jester] 弄臣被处决，单独获胜";
  console.log(log);
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log, prompt: "弄臣被处决，弄臣单独获胜！请游戏引擎处理特殊胜利条件。" } };
};

export const jesterAbility = createRoleAbility({
  roleId: "jester", abilityId: "jester_execution_win", abilityName: "弄臣独胜",
  triggerTiming: [AbilityTriggerTiming.PASSIVE], wakePriority: 0, firstNightOnly: false, wakePromptId: "role.jester.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck], calculate: [calculate], stateUpdate: [stateUpdate], postProcess: [postProcess],
});
