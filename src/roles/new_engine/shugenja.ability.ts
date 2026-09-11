/** 修验者（Shugenja）新引擎技能实现\n * 【角色能力】"首夜，得知太阳方向（邪恶所在方向）。" */
import {
  createDeterministicRandom,
  type DeterministicRandom,
  nightInfoSeed,
} from "../core/deterministicRandom";
import type { MiddlewareContext } from "../../utils/middlewareTypes";
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
  if (!s?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
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
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: { sunDirection: pickSunDirection(rng) },
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
