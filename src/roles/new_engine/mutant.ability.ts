/**
 * 变种人（Mutant）新引擎技能实现
 *
 * 【角色能力】"如果你公开声明自己是变种人，你可能会被处决。"
 *
 * 被动检测变种人是否公开暴露身份。若暴露，标记 mutantRevealed，
 * 由上层逻辑根据此标志判定是否允许处决。
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
  // 通过 storytellerInput 或 meta 标记决定变种人是否已暴露身份
  const mutantRevealed =
    ctx.meta.mutantRevealed === true ||
    ctx.storytellerInput?.mutantRevealed === true;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        mutantRevealed,
        canBeExecuted: mutantRevealed,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.mutantRevealed) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      mutantRevealed: true,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        mutant: r,
      },
    },
    meta: { ...ctx.meta, mutantResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const status = r?.mutantRevealed ? "已暴露身份 → 可被处决" : "身份隐藏";
  const log = `[变种人] ${status}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "检测变种人暴露状态。",
      abilityLog: log,
    },
  };
};

export const mutantAbility = createRoleAbility({
  roleId: "mutant",
  abilityId: "mutant_reveal",
  abilityName: "身份暴露",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
