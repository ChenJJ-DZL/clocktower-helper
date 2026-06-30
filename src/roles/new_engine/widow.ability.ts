/**
 * 寡妇（Widow）新引擎技能实现
 *
 * 【角色能力】"首夜，你会查看所有善良玩家的角色，并连接一名玩家。"
 *
 * FIRST_NIGHT 触发，说书人选择一名连接目标。
 * 寡妇可以看到所有善良玩家角色，并通过 widowConnected 标记连接关系。
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
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  const goodSeats = ctx.snapshot.seats.filter((s: any) => {
    const role = ctx.snapshot.roleAssignments?.[s.id];
    if (!role) return false;
    return role.team === "townsfolk" || role.team === "outsider";
  });
  const goodRoleIds = goodSeats.map((s: any) => ({
    seatId: s.id,
    roleId: ctx.snapshot.roleAssignments?.[s.id]?.id ?? null,
  }));

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        widowConnected: targetId != null,
        goodRoles: goodRoleIds,
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
      widowConnected: r.widowConnected,
      widowConnectedTarget: r.targetId,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        widow: r,
      },
    },
    meta: { ...ctx.meta, widowResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    "[寡妇] " +
    (r.targetId != null ? "已连接 " + (r.targetId + 1) + " 号玩家" : "未连接");
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt:
        "唤醒" +
        (ctx.actionNode.seatId + 1) +
        "号【寡妇】，查看善良玩家角色，选择一名玩家连接。",
      abilityLog: log,
    },
  };
};

export const widowAbility = createRoleAbility({
  roleId: "widow",
  abilityId: "widow_night",
  abilityName: "寡妇",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: 31,
  otherNightPriority: null,
  firstNightOnly: true,
  wakePromptId: "role.widow.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
