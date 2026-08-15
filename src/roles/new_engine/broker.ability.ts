/**
 * 掮客（Broker）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你要选择两名存活玩家：如果他们阵营相同，今晚任何玩家使用自身能力
 *   选择他们之一作为目标时，改为选中另一名玩家。"
 *
 * - 每晚选两名存活玩家（不能选自己）。
 * - 两目标阵营相同 → snapshot.brokerSwap = { a, b } 生效：
 *   全局钩子 redirectBrokerTargets 在能力结算前把对 a/b 的选择重定向到另一个。
 * - 两目标阵营不同 → 不形成 swap，无重定向。
 * - 被转移目标的玩家不会得知；掮客不会得知是否有人被转移。
 *
 * 网页版适配：swap 数据写入快照，重定向由管线级钩子统一执行，UI 按重定向后目标结算。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

/** 判定座位阵营（与 gameRules.isEvil 语义一致，避免循环依赖） */
function seatIsEvil(seat: any): boolean {
  if (!seat?.role) return false;
  if (seat.isGoodConverted) return false;
  return (
    seat.isEvilConverted === true ||
    seat.role.type === "demon" ||
    seat.role.type === "minion" ||
    seat.isDemonSuccessor === true
  );
}

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetIds = (ctx.targetIds ?? []).filter((t) => t != null) as number[];
  const [a, b] = targetIds;
  if (a == null || b == null) {
    return { ...ctx, aborted: true, abortReason: "必须选择两名存活玩家" };
  }
  if (a === b) {
    return { ...ctx, aborted: true, abortReason: "两名目标不能相同" };
  }

  const seats = (ctx.snapshot.seats ?? []) as any[];
  const seatA = seats.find((s) => s.id === a);
  const seatB = seats.find((s) => s.id === b);
  if (!seatA || !seatB) {
    return { ...ctx, aborted: true, abortReason: "目标玩家不存在" };
  }

  const sameAlignment = seatIsEvil(seatA) === seatIsEvil(seatB);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        a,
        b,
        sameAlignment,
        swapActive: sameAlignment,
        brokerActive: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      // 同阵营才形成重定向对；不同阵营清除旧 swap
      brokerSwap: r.swapActive ? { a: r.a, b: r.b } : undefined,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        broker: r,
      },
    },
    meta: { ...ctx.meta, brokerResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const note = r?.swapActive
    ? `（同阵营，${r.a + 1}号 ↔ ${r.b + 1}号形成目标转移）`
    : "（阵营不同，不形成目标转移）";
  const log = `[Broker] 选择 ${r?.a != null ? r.a + 1 + "号" : ""} 与 ${r?.b != null ? r.b + 1 + "号" : ""}${note}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【掮客】：选择两名存活玩家。${log}`,
      displayInfo: {
        type: "broker_set",
        a: r?.a ?? null,
        b: r?.b ?? null,
        swapActive: r?.swapActive ?? false,
      },
      abilityLog: log,
    },
  };
};

export const brokerAbility = createRoleAbility({
  roleId: "broker",
  abilityId: "broker_swap",
  abilityName: "掮客",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 31,
  otherNightPriority: 31,
  firstNightOnly: false,
  wakePromptId: "role.broker.wake",
  targetConfig: { min: 2, max: 2, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
  // 全局机制声明：目标重定向（管线 before_calculate 阶段自动应用）
  globalRules: [
    { id: "broker_redirect", type: "target_redirect", phase: "before_calculate", order: 10 },
  ],
});
