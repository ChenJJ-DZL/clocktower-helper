/**
 * 食人族（Cannibal）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，你会获得当天被处决玩家的能力，直到你再次获得另一名被处决玩家的能力。"
 *
 * 被动触发技能：白天处决发生后自动触发。
 * 记录被处决玩家的 ID，若该玩家是镇民则食人族获得其能力。
 * 通过 snapshot.cannibal.lastExecutedPlayerId 持久化。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

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
  // 从 snapshot 读取当天被处决的玩家
  const executedToday = (ctx.snapshot as any).executedToday ?? null;
  const executedSeat =
    executedToday != null
      ? ctx.snapshot.seats.find((s: any) => s.id === executedToday)
      : null;
  const executedRole = executedSeat?.role?.name ?? null;
  const isTownsfolk = executedSeat?.role?.type === "townsfolk";

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        lastExecutedPlayerId: executedToday,
        executedRole,
        isTownsfolk,
        gainedRoleId: isTownsfolk ? (executedSeat?.role?.id ?? null) : null,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const existing = ((ctx.snapshot as any).cannibal ?? {}) as any;

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      cannibal: {
        ...existing,
        lastExecutedPlayerId: r.lastExecutedPlayerId,
        gainedRoleId: r.gainedRoleId,
        executedRole: r.executedRole,
      },
    } as any,
    meta: { ...ctx.meta, cannibalResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.lastExecutedPlayerId != null
      ? `[Cannibal] 得知处决: ${r.lastExecutedPlayerId + 1}号(${r.executedRole ?? "未知"})${r.gainedRoleId ? " → 获得其能力" : ""}`
      : "[Cannibal] 今日无处决";
  console.log(log);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: r?.gainedRoleId
        ? `告知${ctx.actionNode.seatId + 1}号【食人族】获取了 ${r.executedRole} 的能力。`
        : `告知${ctx.actionNode.seatId + 1}号【食人族】今日无有效处决。`,
      abilityLog: log,
    },
  };
};

export const cannibalAbility = createRoleAbility({
  roleId: "cannibal",
  abilityId: "cannibal_passive",
  abilityName: "吞噬能力",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.cannibal.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
