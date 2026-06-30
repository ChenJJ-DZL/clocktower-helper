/**
 * 杂耍艺人（Juggler）新引擎技能实现
 *
 * 【角色能力】首日一次，猜测5名不同玩家的角色。说书人会告知猜对了几个。
 *
 * DAY触发，limited ability（每局一次）。
 * 选择5名玩家并猜测他们的角色。
 * targetConfig: min:5, max:5 — 必须选满5名玩家。
 */
import {
  canUseLimitedAbility,
  consumeLimitedAbility,
} from "../../utils/LimitedAbilityManager";
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否已使用能力
const preCheckLimitedAbility = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  if (!canUseLimitedAbility(ctx.actionNode.seatId, "juggler_guess")) {
    return { ...ctx, aborted: true, abortReason: "杂耍艺人已经使用过能力了" };
  }
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const guesses = ctx.storytellerInput?.guesses ?? [];
  const correctCount = ctx.storytellerInput?.correctCount ?? 0;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        guesses,
        correctCount,
        used: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!ctx.aborted) {
    consumeLimitedAbility(ctx.actionNode.seatId, "juggler_guess");
  }
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        juggler: r,
      },
    },
    meta: { ...ctx.meta, jugglerResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[杂耍艺人] 猜对了${r?.correctCount ?? 0}个`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【杂耍艺人】，选择5名玩家并猜测他们的角色。`,
      abilityLog: log,
    },
  };
};

export const jugglerAbility = createRoleAbility({
  roleId: "juggler",
  abilityId: "juggler_guess",
  abilityName: "杂耍猜测",
  triggerTiming: [AbilityTriggerTiming.DAY],
  firstNightPriority: null,
  otherNightPriority: 100,
  firstNightOnly: false,
  wakePromptId: "role.juggler.wake",
  targetConfig: { min: 5, max: 5, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive, preCheckLimitedAbility],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
