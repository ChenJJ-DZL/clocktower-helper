/**
 * 笨蛋（Klutz）新引擎技能实现
 *
 * 【角色能力】"当你第一次死亡时，随机一名善良玩家死亡。"
 *
 * 被动检测笨蛋首次死亡。从存活善良玩家中随机选择一名标记死亡。
 * 若无可杀目标（全场无善良存活），则跳过。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (seat?.isAlive) return { ...ctx, aborted: true, abortReason: "尚未死亡" };
  // 已触发过则不再触发
  if ((ctx.snapshot as any).klutzTriggered)
    return { ...ctx, aborted: true, abortReason: "已触发过" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 支持通过 targetIds[0] 或 storytellerInput.chosenSeatId 选择存活玩家
  const targetId =
    ctx.targetIds?.[0] ??
    ctx.actionNode.targetIds?.[0] ??
    ctx.storytellerInput?.chosenSeatId ??
    null;

  if (targetId == null) {
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityResult: { targetId: null, isEvil: false, evilWins: false },
      },
    };
  }

  const chosenSeat = ctx.snapshot.seats.find((s: any) => s.id === targetId);
  const isEvil = (() => {
    if (!chosenSeat) return false;
    if (chosenSeat.isEvilConverted) return true;
    if (chosenSeat.isGoodConverted) return false;
    if ((chosenSeat as any).alignment === "evil") return true;
    if ((chosenSeat as any).alignment === "good") return false;
    const t = chosenSeat.role?.type;
    return t === "minion" || t === "demon";
  })();

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        isEvil,
        evilWins: isEvil,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r || r.targetId == null) return ctx;

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      klutzTriggered: true,
      klutzChosenSeatId: r.targetId,
      gameOver: r.evilWins,
      winner: r.evilWins ? "evil" : (ctx.snapshot as any).winner,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        klutz: r,
      },
    },
    meta: { ...ctx.meta, klutzResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const status = r?.killed
    ? `随机杀死 ${(r.targetId ?? 0) + 1} 号玩家`
    : "无可杀目标";
  const log = `[笨蛋] ${status}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "检测笨蛋死亡效果。",
      abilityLog: log,
    },
  };
};

export const klutzAbility = createRoleAbility({
  roleId: "klutz",
  abilityId: "klutz_death",
  abilityName: "笨手笨脚",
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
