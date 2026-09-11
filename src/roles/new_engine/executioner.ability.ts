/**
 * 刽子手（Executioner）新引擎技能实现
 *
 * 【角色能力】"当你被处决时，随机带走一名其他玩家。"
 *
 * 被处决时从存活玩家中随机选择一名带走（死亡）。
 * allowSelf: false — 无需选择目标，自动触发
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  type DeterministicRandom,
  nightInfoSeed,
} from "../core/deterministicRandom";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  // 刽子手必须是被处决时才触发
  const isExecuted =
    (ctx.snapshot as any).executedToday === ctx.actionNode.seatId ||
    (ctx.snapshot as any).todayExecutions?.includes?.(ctx.actionNode.seatId);
  if (!seat || !isExecuted)
    return { ...ctx, aborted: true, abortReason: "未被处决" };
  return ctx;
};

/**
 * 从存活的其他玩家中随机挑一名带走。
 *
 * @param rng 确定性随机源（默认 Math.random，管线内传入按夜次播种的序列）
 */
export function pickExecutionerVictim(
  seats: any[],
  executionerSeatId: number,
  rng: DeterministicRandom = Math.random
): any | null {
  const others = seats.filter(
    (s: any) => s.id !== executionerSeatId && s.isAlive
  );
  if (others.length === 0) return null;
  return others[Math.floor(rng() * others.length)];
}

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 🎲 确定性随机：同一天、同一角色的重复计算（提示预演 / 实际执行）必须选中
  // 同一名玩家，否则提示里写的随机目标会与结算结果对不上。
  const rng = createDeterministicRandom(
    nightInfoSeed(
      "executioner",
      ctx.actionNode.seatId,
      ctx.snapshot.nightCount ?? 1
    )
  );
  const target = pickExecutionerVictim(
    ctx.snapshot.seats,
    ctx.actionNode.seatId,
    rng
  );
  if (!target)
    return { ...ctx, aborted: true, abortReason: "无其他存活玩家" };
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId: target.id,
        executionerId: ctx.actionNode.seatId,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  // 标记目标玩家死亡
  const updatedSeats = ctx.snapshot.seats.map((s: any) =>
    s.id === r?.targetId ? { ...s, isAlive: false } : s
  );
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        executioner: r,
      },
    },
    meta: { ...ctx.meta, executionerResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[刽子手] ${ctx.actionNode.seatId + 1}号被处决，带走了${r.targetId + 1}号`
      : "[刽子手] 未带走任何玩家";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `${ctx.actionNode.seatId + 1}号【刽子手】被处决，将随机带走一名玩家。`,
      abilityLog: log,
    },
  };
};

export const executionerAbility = createRoleAbility({
  roleId: "executioner",
  abilityId: "executioner_take",
  abilityName: "刽子手",
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
