/**
 * 维齐尔（Vizier）新引擎技能实现
 *
 * 【角色能力】"你可以公开宣布你是维齐尔。你无法在白天被处决。"
 *
 * PASSIVE 触发，标记 vizierRevealed 到 snapshot。
 * 效果由 UI 层实现：维齐尔公开后白天投票处决无效。
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
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        vizierRevealed: true,
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
      vizierRevealed: true,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        vizier: r,
      },
    },
    meta: { ...ctx.meta, vizierResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const log = "[维齐尔] 维齐尔已公开身份，白天无法被处决";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt:
        "唤醒" +
        (ctx.actionNode.seatId + 1) +
        "号【维齐尔】，你可以公开宣布身份。",
      abilityLog: log,
    },
  };
};

export const vizierAbility = createRoleAbility({
  roleId: "vizier",
  abilityId: "vizier_public",
  abilityName: "维齐尔",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: 87,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
