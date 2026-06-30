/**
 * 历史学家（Historian）新引擎技能实现
 *
 * 【角色能力】"你得知前一天的能力使用情况。"
 *
 * 每天获取前一天所有已触发的能力使用记录。
 * allowSelf: false — 无需选择目标
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
  // 收集前一天的能力结果
  const prevResults = (ctx.snapshot as any)._abilityResults ?? {};
  const historyLog = Object.entries(prevResults)
    .filter(([key]) => key !== "historian")
    .map(([key, val]: [string, any]) => `${key}: ${JSON.stringify(val)}`);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        learned: true,
        history: prevResults,
        historySummary: historyLog.join("; "),
      },
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
        historian: r,
      },
    },
    meta: { ...ctx.meta, historianResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[历史学家] ${ctx.actionNode.seatId + 1}号 获取历史记录: ${r?.historySummary ?? "无"}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `告知${ctx.actionNode.seatId + 1}号【历史学家】前一天的能力使用情况。`,
      abilityLog: log,
    },
  };
};

export const historianAbility = createRoleAbility({
  roleId: "historian",
  abilityId: "historian_learn",
  abilityName: "历史学家",
  triggerTiming: [
    AbilityTriggerTiming.FIRST_NIGHT,
    AbilityTriggerTiming.EVERY_NIGHT,
  ],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.historian.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
