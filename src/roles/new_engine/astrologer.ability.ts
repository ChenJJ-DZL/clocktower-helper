/**
 * 星象师（Astrologer）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你可以选择一名玩家猜测其阵营。
 *   说书人告诉你是否正确。（限一次）"
 *
 * 每夜选一名玩家猜阵营，说书人告知是否正确。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find((s: any) => s.id === ctx.actionNode.seatId);
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  // 非首夜（星象师首夜不行动）
  const nc = ctx.snapshot.nightCount ?? 0;
  if (nc <= 1 && ctx.snapshot.gamePhase !== "otherNight") return { ...ctx, aborted: true, abortReason: "首夜不行动" };
  return ctx;
};

const calculate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  const target = targetId != null ? ctx.snapshot.seats.find((s: any) => s.id === targetId) : null;
  const isEvil = target?.role?.type === "minion" || target?.role?.type === "demon";
  const guess = ctx.storytellerInput?.guess ?? "evil"; // 说书人判定

  return {
    ...ctx, meta: {
      ...ctx.meta, abilityResult: {
        targetId, guess,
        correct: (guess === "evil" && isEvil) || (guess === "good" && !isEvil),
      },
    },
  };
};

const stateUpdate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    snapshot: { ...ctx.snapshot, _abilityResults: { ...((ctx.snapshot as any)._abilityResults ?? {}), astrologer: r } },
    meta: { ...ctx.meta, astrologerResult: r },
  };
};

const postProcess = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = r?.targetId != null
    ? `[Astrologer] 猜测${r.targetId + 1}号: ${r.correct ? "✅正确" : "❌错误"}`
    : "[Astrologer] 未行动";
  console.log(log);
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log, prompt: `唤醒${ctx.actionNode.seatId + 1}号【星象师】，选择一名玩家猜测阵营。` } };
};

export const astrologerAbility = createRoleAbility({
  roleId: "astrologer", abilityId: "astrologer_guess", abilityName: "阵营猜测",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT], wakePriority: 50, firstNightOnly: false,
  wakePromptId: "role.astrologer.wake", targetConfig: { min: 1, max: 1, allowSelf: true, allowDead: false },
  preCheck: [preCheck], calculate: [calculate], stateUpdate: [stateUpdate], postProcess: [postProcess],
});
