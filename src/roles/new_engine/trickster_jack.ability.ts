/**
 * 恶作剧杰克（Trickster Jack）新引擎技能实现
 *
 * 【角色能力】"被处决时随机与一人交换角色。"
 *
 * 当恶作剧杰克被处决时，随机选择一名存活玩家与之交换角色。
 *
 * ⚠️ 「随机挑人」同样会被算两次：被处决时的行动预演（说书人提示「随机与 X 号
 * 交换角色」）与确认后的实际执行。改用按 (能力ID, 座位, 夜次) 构造的确定性
 * 随机，保证提示与实际执行挑中同一名玩家（见 core/deterministicRandom.ts）。
 */
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
 * 从「除自己以外的存活玩家」中随机挑一名交换对象。
 * 无候选时返回 null。
 */
export function pickSwapTargetId(
  seats: Array<{ id: number; isAlive?: boolean }>,
  selfSeatId: number,
  rng: DeterministicRandom = Math.random
): number | null {
  const aliveOthers = seats.filter((s) => s.isAlive && s.id !== selfSeatId);
  if (aliveOthers.length === 0) return null;
  return aliveOthers[Math.floor(rng() * aliveOthers.length)].id;
}

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
  // 🎲 确定性随机：同一夜、同一角色的重复计算必须挑中同一名玩家
  const rng = createDeterministicRandom(
    nightInfoSeed(
      "trickster_jack",
      ctx.actionNode.seatId,
      ctx.snapshot.nightCount ?? 1
    )
  );
  const targetId = pickSwapTargetId(
    ctx.snapshot.seats as any[],
    ctx.actionNode.seatId,
    rng
  );
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        tricksterActive: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.tricksterActive) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        tricksterJack: r,
      },
    },
    meta: { ...ctx.meta, tricksterResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[恶作剧杰克] 与${r.targetId + 1}号交换角色`
      : "[恶作剧杰克] 无目标可交换";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `【恶作剧杰克】被处决，随机与${r?.targetId != null ? `${r.targetId + 1}号` : "一名玩家"}交换角色。`,
      abilityLog: log,
    },
  };
};

export const trickster_jackAbility = createRoleAbility({
  roleId: "trickster_jack",
  abilityId: "trickster_jack_passive",
  abilityName: "恶作剧杰克",
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
