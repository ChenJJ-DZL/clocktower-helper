/**
 * 替罪羊（Scapegoat）新引擎技能实现
 *
 * 【官方百科能力】"如果你的阵营的一名玩家被处决，你可能会代替他被处决。"
 *
 * 运作方式：
 * - 当一名与替罪羊同阵营的玩家（考虑间谍/陌客等注册判定）即将被处决时，
 *   说书人可以选择由替罪羊来代替该玩家被处决。
 * - 替罪羊会因此被处决并死亡，原被提名的玩家免于处决和死亡。
 * - 若当晚送葬者存活，送葬者会得知替罪羊在白天被处决。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";
import { canScapegoatSubstitute } from "../../utils/expansionMechanics";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const scapegoatSeat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!scapegoatSeat?.isAlive) {
    return { ...ctx, aborted: true, abortReason: "替罪羊已死亡" };
  }

  // 检查原被处决者
  const nominatedSeatId =
    ctx.storytellerInput?.nominatedSeatId ??
    (ctx.actionNode as any).nominatedSeatId ??
    ctx.snapshot.nominatedPlayerId;

  const nominatedSeat = ctx.snapshot.seats.find((s: any) => s.id === nominatedSeatId);
  if (!nominatedSeat) {
    return { ...ctx, aborted: true, abortReason: "未找到被处决玩家" };
  }

  // 必须是同阵营（考虑伪装）
  if (!canScapegoatSubstitute(scapegoatSeat, nominatedSeat)) {
    return { ...ctx, aborted: true, abortReason: "被处决玩家与替罪羊不同阵营" };
  }

  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const scapegoatSeatId = ctx.actionNode.seatId;
  const nominatedSeatId =
    ctx.storytellerInput?.nominatedSeatId ??
    (ctx.actionNode as any).nominatedSeatId ??
    ctx.snapshot.nominatedPlayerId;

  // 说书人选择是否触发替罪羊替代
  const shouldSubstitute =
    ctx.storytellerInput?.shouldSubstitute !== undefined
      ? ctx.storytellerInput.shouldSubstitute
      : true;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        scapegoatSeatId,
        nominatedSeatId,
        substituted: shouldSubstitute,
        executedSeatId: shouldSubstitute ? scapegoatSeatId : nominatedSeatId,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.substituted) return ctx;

  const scapegoatSeatId = r.scapegoatSeatId;
  const nominatedSeatId = r.nominatedSeatId;

  // 替罪羊代替死亡，原玩家存活
  const updatedSeats = ctx.snapshot.seats.map((s: any) => {
    if (s.id === scapegoatSeatId) {
      return {
        ...s,
        isDead: true,
        isAlive: false,
        deathReason: "executed",
        statusDetails: [...(s.statusDetails ?? []), "代替同阵营玩家被处决"],
      };
    }
    if (s.id === nominatedSeatId) {
      // 免死
      return {
        ...s,
        isDead: false,
        isAlive: true,
      };
    }
    return s;
  });

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      executedTodayId: scapegoatSeatId,
      deadTodayIds: [...(ctx.snapshot.deadTodayIds ?? []), scapegoatSeatId],
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        scapegoat: r,
      },
    },
    meta: { ...ctx.meta, scapegoatResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.substituted) {
    const log = `[替罪羊] 说书人决定不触发替罪羊代替处决，${(r?.nominatedSeatId ?? -1) + 1}号正常被处决`;
    console.log(log);
    return { ...ctx, meta: { ...ctx.meta, abilityLog: log } };
  }

  const log = `[替罪羊] ${r.scapegoatSeatId + 1}号替罪羊代替${r.nominatedSeatId + 1}号被处决并死亡！`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt: `替罪羊代替${r.nominatedSeatId + 1}号被处决。宣告替罪羊死亡。`,
      displayInfo: {
        type: "scapegoat_substitution",
        scapegoatSeatId: r.scapegoatSeatId,
        nominatedSeatId: r.nominatedSeatId,
        log,
      },
    },
  };
};

export const scapegoatAbility = createRoleAbility({
  roleId: "scapegoat",
  abilityId: "scapegoat_execution_substitution",
  abilityName: "替罪代刑",
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
