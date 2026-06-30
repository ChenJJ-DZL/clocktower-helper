/**
 * 开悟者（Enlightened）新引擎技能实现
 *
 * 【角色能力】"第一夜：你得知真相（所有角色的配置信息）。"
 *
 * 在第一夜获知全场所有玩家的角色配置信息。
 * allowSelf: false — 无需选择目标
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
  // 收集所有玩家的角色配置
  const allRoles = ctx.snapshot.seats.map((s: any) => ({
    id: s.id,
    roleId: s.roleId ?? s.role?.id ?? "unknown",
    roleName: s.roleName ?? s.role?.name ?? "未知",
    alignment: s.alignment ?? s.role?.alignment ?? "unknown",
  }));
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        learned: true,
        allRoles,
        totalPlayers: allRoles.length,
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
        enlightened: r,
      },
    },
    meta: { ...ctx.meta, enlightenedResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const roleList =
    r?.allRoles?.map((x: any) => `${x.id + 1}号=${x.roleName}`).join(", ") ??
    "无";
  const log = `[开悟者] ${ctx.actionNode.seatId + 1}号 得知全场配置: ${roleList}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【开悟者】，告知其全场角色配置：${roleList}`,
      abilityLog: log,
    },
  };
};

export const enlightenedAbility = createRoleAbility({
  roleId: "enlightened",
  abilityId: "enlightened_reveal",
  abilityName: "开悟者",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: true,
  wakePromptId: "role.enlightened.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
