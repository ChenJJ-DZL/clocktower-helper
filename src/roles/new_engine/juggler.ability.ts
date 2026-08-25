/**
 * 杂耍艺人（Juggler）新引擎技能实现
 *
 * 【角色能力】每局一次，猜测最多5名不同玩家的角色。说书人会告知猜对了几个。
 *
 * DAY触发，limited ability（每局一次）。
 * 选择至多5名玩家并猜测他们的角色（可少于5名或跳过）。
 * targetConfig: min:0, max:5 — 最多选满5名玩家。
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
  const guesses =
    ctx.storytellerInput?.guesses ??
    (ctx.snapshot as any).jugglerGuesses ??
    [];
  let correctCount = ctx.storytellerInput?.correctCount;
  if (correctCount === undefined) {
    correctCount = 0;
    for (const g of guesses) {
      const seat = ctx.snapshot.seats.find(
        (s: any) => s.id === g.targetSeatId
      );
      if (
        seat &&
        (seat.role?.name === g.roleName ||
          seat.role?.id === g.roleId ||
          (seat as any).charadeRole?.name === g.roleName)
      ) {
        correctCount++;
      }
    }
  }
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
      displayInfo: {
        type: "juggler_info",
        correctCount: r?.correctCount ?? 0,
        log,
      },
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
  // 🔧 修复：杂耍艺人官方规则"每局一次，选择最多5名玩家"——可选0~5名（可跳过），
  //   min:5 在存活玩家不足5人时无法满足 → I5 违规。
  targetConfig: { min: 0, max: 5, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive, preCheckLimitedAbility],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
