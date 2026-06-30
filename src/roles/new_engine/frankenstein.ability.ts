/**
 * 弗兰肯斯坦（Frankenstein）新引擎技能实现
 *
 * 【角色能力】"当你死亡时，可以选择组合两名玩家的角色。"
 *
 * 死亡时选择两名玩家（含自己），将他们的角色组合为一个新角色。
 * allowSelf: true — 可以选择自己作为组合材料
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
  if (!seat) return { ...ctx, aborted: true, abortReason: "不存在" };
  // 必须在死亡时触发
  if (seat.isAlive) return { ...ctx, aborted: true, abortReason: "尚未死亡" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetIds = ctx.targetIds ?? ctx.actionNode.targetIds ?? [];
  if (targetIds.length < 2)
    return { ...ctx, aborted: true, abortReason: "需要选择两名玩家" };
  const players = targetIds.slice(0, 2).map((id: number) => {
    const seat = ctx.snapshot.seats.find((s: any) => s.id === id);
    return {
      id,
      roleId: seat?.roleId ?? seat?.role?.id ?? "unknown",
      roleName: seat?.roleName ?? seat?.role?.name ?? "未知",
    };
  });
  const combinedRoleName = `${players[0].roleName}+${players[1].roleName}`;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        players,
        combinedRoleName,
        frankensteinId: ctx.actionNode.seatId,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        frankenstein: r,
      },
    },
    meta: { ...ctx.meta, frankensteinResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const names =
    r?.players?.map((p: any) => `${p.id + 1}号(${p.roleName})`).join(" + ") ??
    "无";
  const log = r?.combinedRoleName
    ? `[弗兰肯斯坦] ${ctx.actionNode.seatId + 1}号 组合 ${names} → ${r.combinedRoleName}`
    : "[弗兰肯斯坦] 未组合";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `${ctx.actionNode.seatId + 1}号【弗兰肯斯坦】已死亡，选择两名玩家组合角色。`,
      abilityLog: log,
    },
  };
};

export const frankensteinAbility = createRoleAbility({
  roleId: "frankenstein",
  abilityId: "frankenstein_combine",
  abilityName: "弗兰肯斯坦",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.frankenstein.wake",
  targetConfig: { min: 2, max: 2, allowSelf: true, allowDead: true },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
