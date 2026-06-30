/**
 * 告密者（Snitch）新引擎技能实现
 *
 * 【角色能力】"如果有至少2名爪牙存活，你会被展示给所有爪牙。"
 *
 * PASSIVE 触发，检查存活爪牙数量。如果 >= 2，标记 snitchRevealed 到 snapshot，
 * 供信息阶段向爪牙方展示告密者身份。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const minionSeats = ctx.snapshot.seats.filter((s: any) => {
    const role = ctx.snapshot.roleAssignments?.[s.id];
    if (!role) return false;
    return role.team === "minion" && s.isAlive;
  });
  const minionCount = minionSeats.length;
  const revealed = minionCount >= 2;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        snitchRevealed: revealed,
        minionCount,
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
      snitchRevealed: r.snitchRevealed,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        snitch: r,
      },
    },
    meta: { ...ctx.meta, snitchResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const status = r.snitchRevealed
    ? "存活爪牙 >= 2，告密者身份已暴露给爪牙"
    : "存活爪牙不足 2，告密者未暴露";
  const log = "[告密者] " + status;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt:
        "唤醒" +
        (ctx.actionNode.seatId + 1) +
        "号【告密者】，检测存活爪牙数量：" +
        r.minionCount +
        "。",
      abilityLog: log,
    },
  };
};

export const snitchAbility = createRoleAbility({
  roleId: "snitch",
  abilityId: "snitch_passive",
  abilityName: "告密",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: 12,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
