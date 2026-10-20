/**
 * 女祭司（High Priestess）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你会得知一名与你有交流对象的玩家。"
 *
 * 每夜从其他玩家中随机（或说书人指定）选择一名作为交流指引对象。
 * allowSelf: false — 不能选择自己
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import { isVortoxWorldActive } from "../../utils/vortoxWorld";
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
  if (!seat || seat.isDead) return { ...ctx, aborted: true, abortReason: "已死亡" };
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
  const trueTargetId =
    ctx.storytellerInput?.targetId ?? pickGuideTargetId(candidates, rng);

  /**
   * ⭐ 2026-10-20 修复（用户实测：涡流局信息并非 100% 错）：
   * 【官方原文·女祭司】"每个夜晚，你会得知一名说书人认为你最应该与其交流的玩家。"
   * ⇒ 这是信息类能力：受干扰（涡流/中毒/醉酒/能力失效）时**必须给错误玩家**。
   *   旧实现无论干扰与否都返回同一个 targetId ⇒ 涡流下仍有真值泄漏。
   */
  const hasVortox =
    isVortoxWorldActive(ctx.snapshot.seats as any) ||
    Boolean((ctx.snapshot as any).isVortoxWorld);
  const isCorrupted =
    hasVortox ||
    ctx.meta?.isAbilityActive === false ||
    ctx.meta?.abilityEffective === false;

  let targetId: number | null = trueTargetId;
  if (isCorrupted && trueTargetId != null) {
    // 受干扰 ⇒ 从其余玩家里挑一个**不等于真值**的（仍然确定性）
    const others = candidates.filter((s: any) => s.id !== trueTargetId);
    targetId =
      others.length > 0
        ? (pickGuideTargetId(others, rng) ?? trueTargetId)
        : trueTargetId;
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      isCorrupted,
      hasVortox,
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
