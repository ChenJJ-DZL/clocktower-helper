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
import type { MiddlewareContext } from "../../utils/middlewareTypes";
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

// 前置校验：杂耍艺人只能在首个白天猜测（官方 Wiki）
const firstDayOnlyCheck = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const dayCount = (ctx.snapshot as any).dayCount ?? 1;
  if (dayCount !== 1) {
    return {
      ...ctx,
      aborted: true,
      abortReason: "杂耍艺人仅在首个白天可以猜测",
    };
  }
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  if (ctx.aborted) return ctx;

  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  let correctCount =
    ctx.storytellerInput?.correctCount ??
    seat?.dayAbilityResult?.correctCount ??
    (ctx.snapshot as any).jugglerCorrectCount;

  if (correctCount === undefined) {
    const rawGuesses =
      ctx.storytellerInput?.guesses ??
      (ctx.snapshot as any).jugglerGuesses ??
      [];
    const guessList = Array.isArray(rawGuesses)
      ? rawGuesses
      : typeof rawGuesses === "object" && rawGuesses !== null
        ? Object.entries(rawGuesses).map(([targetSeatId, roleName]) => ({
            targetSeatId: Number(targetSeatId),
            roleName:
              typeof roleName === "string"
                ? roleName
                : (roleName as any)?.roleName,
          }))
        : [];

    correctCount = 0;
    for (const g of guessList) {
      const s = ctx.snapshot.seats.find((st: any) => st.id === g.targetSeatId);
      if (
        s &&
        (s.role?.name === g.roleName ||
          s.role?.id === (g as any).roleId ||
          (s as any).charadeRole?.name === g.roleName)
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
        correctCount: Number(correctCount) || 0,
        used: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  if (ctx.aborted) return ctx;
  const r = ctx.meta.abilityResult as any;
  consumeLimitedAbility(ctx.actionNode.seatId, "juggler_guess");
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
  if (ctx.aborted) return ctx;
  const r = ctx.meta.abilityResult as any;
  const count = r?.correctCount ?? 0;
  const log = `得知的数字为${count}（猜对了${count}个）`;
  console.log(`[杂耍艺人] ${log}`);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【杂耍艺人】，告诉他得知的数字为${count}（手势比划 ${count}）。`,
      abilityLog: log,
      displayInfo: {
        type: "juggler_info",
        correctCount: count,
        log,
      },
    },
  };
};

export const jugglerAbility = createRoleAbility({
  roleId: "juggler",
  abilityId: "juggler_guess",
  abilityName: "杂耍猜测",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT, AbilityTriggerTiming.DAY],
  firstNightPriority: null,
  otherNightPriority: 100,
  firstNightOnly: false,
  wakePromptId: "role.juggler.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive, firstDayOnlyCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
