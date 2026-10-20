/** 修验者（Shugenja）新引擎技能实现\n * 【角色能力】"首夜，得知太阳方向（邪恶所在方向）。" */
import {
  createDeterministicRandom,
  type DeterministicRandom,
  nightInfoSeed,
} from "../core/deterministicRandom";
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import { isSeatEvil } from "../../utils/seatAlignment";
import { isVortoxWorldActive } from "../../utils/vortoxWorld";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

/**
 * 随机决定太阳方向（左 / 右）。
 *
 * ⚠️ 首夜行动会被计算两次（preview 提示 + 实际执行），必须传入确定性随机，
 * 否则说书人念的提示方向会与结算结果不一致（见 core/deterministicRandom.ts）。
 */
export function pickSunDirection(
  rng: DeterministicRandom = Math.random
): "左" | "右" {
  return rng() < 0.5 ? "左" : "右";
}

const pc = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const s = ctx.snapshot.seats.find((s: any) => s.id === ctx.actionNode.seatId);
  if (!s || s.isDead) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};
const calc = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  // 🎲 确定性随机：同一夜、同一角色的重复计算必须得到同一方向
  const rng = createDeterministicRandom(
    nightInfoSeed(
      "shugenja",
      ctx.actionNode.seatId,
      ctx.snapshot.nightCount ?? 1
    )
  );

  /**
   * ⭐ 2026-10-20 修复（用户实测：涡流局信息并非 100% 错）：
   * 旧实现**直接随机返回左/右**，两个方向都错：
   *   · 无涡流时给的不是真值（真值应是「最近邪恶玩家所在方向」）；
   *   · 涡流在场时只有 50% 概率是假 —— 违反官方「一定错误信息」。
   * 【官方原文·修行者】"在你的首个夜晚，你会得知距离最近的邪恶玩家位于你的
   *   顺时针还是逆时针方向。如果两侧的邪恶玩家与你距离相等，你得知的信息由说书人决定。"
   * ⇒ ① 先按座位环算出真方向（等距时说书人裁决，缺省走确定性随机）；
   *   ② 受干扰（涡流/中毒/醉酒/能力失效）时**必须给反方向**，保证 100% 为假。
   *
   * 方向约定：座位号递增方向 = 顺时针 = 「右」；递减 = 逆时针 = 「左」
   *（与圆桌 getSeatPosition 的角度递增方向一致）。
   */
  const seats = (ctx.snapshot.seats ?? []) as any[];
  const n = seats.length;
  const selfId = ctx.actionNode.seatId;

  let bestCw = Infinity;
  let bestCcw = Infinity;
  for (const s of seats) {
    if (!isSeatEvil(s as any) || s.id === selfId) continue;
    const cw = ((s.id - selfId) % n + n) % n; // 顺时针步数
    const ccw = ((selfId - s.id) % n + n) % n; // 逆时针步数
    if (cw > 0) bestCw = Math.min(bestCw, cw);
    if (ccw > 0) bestCcw = Math.min(bestCcw, ccw);
  }

  const explicit = (ctx.storytellerInput as any)?.direction;
  let trueDirection: "左" | "右";
  if (bestCw < bestCcw) trueDirection = "右";
  else if (bestCcw < bestCw) trueDirection = "左";
  else if (explicit === "左" || explicit === "右") trueDirection = explicit;
  // 等距（或无邪恶玩家）：由说书人决定；缺省用确定性随机兜底
  else trueDirection = pickSunDirection(rng);

  const hasVortox =
    isVortoxWorldActive(seats as any) || Boolean((ctx.snapshot as any).isVortoxWorld);
  const isCorrupted =
    hasVortox ||
    ctx.meta?.isAbilityActive === false ||
    ctx.meta?.abilityEffective === false;

  // 受干扰 ⇒ 必反向（保证 100% 假）；否则给真值
  const sunDirection: "左" | "右" = isCorrupted
    ? trueDirection === "左"
      ? "右"
      : "左"
    : trueDirection;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      isCorrupted,
      hasVortox,
      abilityResult: { sunDirection },
    },
  };
};
const su = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return {
    ...ctx,
    meta: { ...ctx.meta, shugenjaResult: ctx.meta.abilityResult },
  };
};
const pp = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  console.log(`[Shugenja] 太阳方向:${r?.sunDirection ?? "未知"}`);
  return ctx;
};
export const shugenjaAbility = createRoleAbility({
  roleId: "shugenja",
  abilityId: "shugenja_sun",
  abilityName: "修验者",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: 78,
  otherNightPriority: null,
  firstNightOnly: true,
  wakePromptId: "role.shugenja.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [pc],
  calculate: [calc],
  stateUpdate: [su],
  postProcess: [pp],
});
