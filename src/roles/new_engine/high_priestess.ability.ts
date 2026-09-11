/**
 * 女祭司（High Priestess）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你会得知一名与你有交流对象的玩家。"
 *
 * 每夜从其他玩家中随机（或说书人指定）选择一名作为交流指引对象。
 * allowSelf: false — 不能选择自己
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";
import {
  createDeterministicRandom,
  type DeterministicRandom,
  nightInfoSeed,
} from "../core/deterministicRandom";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};

/**
 * 从其他玩家中挑一名"交流指引对象"（模拟说书人的随机指定）。
 *
 * rng 必须由调用方注入：calculate 会被执行两次（生成"当前的行动"预演 +
 * 真正结算），若两处各自调用 Math.random()，预演指引的人与实际指引的人不同。
 */
export function pickGuideTargetId(
  candidates: any[],
  rng: DeterministicRandom = Math.random
): number | null {
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)]?.id ?? null;
}

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 🎲 确定性随机：同一夜、同一女祭司的重复计算必须指引到同一名玩家
  const rng = createDeterministicRandom(
    nightInfoSeed(
      "high_priestess",
      ctx.actionNode.seatId,
      ctx.snapshot.nightCount ?? 1
    )
  );

  const candidates = ctx.snapshot.seats.filter(
    (s: any) => s.id !== ctx.actionNode.seatId
  );
  const targetId =
    ctx.storytellerInput?.targetId ?? pickGuideTargetId(candidates, rng);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: { targetId },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    meta: { ...ctx.meta, highPriestessResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const msg = r?.targetId != null ? `指引 ${r.targetId + 1}号` : "无指引";
  const log = `[女祭司] ${ctx.actionNode.seatId + 1}号: ${msg}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【女祭司】：${msg}`,
      abilityLog: log,
    },
  };
};

export const high_priestessAbility = createRoleAbility({
  roleId: "high_priestess",
  abilityId: "high_priestess_guide",
  abilityName: "女祭司",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 77,
  otherNightPriority: 109,
  firstNightOnly: false,
  wakePromptId: "role.high_priestess.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: true },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
