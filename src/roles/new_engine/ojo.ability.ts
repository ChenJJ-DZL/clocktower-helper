/**
 * 奥乔（Ojo）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，选择一个角色：该角色的玩家死亡。
 *   如果该角色不在场，说书人选择谁死亡。"
 *
 * 按角色名狙杀，不是按玩家选择。
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
  const targetRoleId = ctx.storytellerInput?.targetRoleId ?? null;
  const seats = ctx.snapshot.seats ?? [];

  // 找到拥有该角色的存活玩家
  const targetSeat = targetRoleId
    ? seats.find((s: any) => s.role?.id === targetRoleId && s.isAlive)
    : null;

  // 如果角色不在场，说书人手动指定目标
  const fallbackTargetId = ctx.storytellerInput?.fallbackTargetId ?? null;
  const finalTargetId = targetSeat?.id ?? fallbackTargetId;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetRoleId,
        targetSeatId: finalTargetId,
        roleFound: !!targetSeat,
        killByRoleName: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (r?.targetSeatId == null) return ctx;
  const seats = (ctx.snapshot.seats ?? []) as any[];
  const updatedSeats = seats.map((s: any) =>
    s.id === r.targetSeatId
      ? { ...s, isDead: true, isAlive: false, deathSource: "ojo" }
      : s
  );
  return {
    ...ctx,
    snapshot: { ...ctx.snapshot, seats: updatedSeats },
    meta: { ...ctx.meta, ojoResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetSeatId != null
      ? `[Ojo] 奥乔击杀 ${r.targetSeatId + 1}号（${r.targetRoleId ?? "说书人指定"}）`
      : "[Ojo] 奥乔无目标";
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log } };
};

export const ojoAbility = createRoleAbility({
  roleId: "ojo",
  abilityId: "ojo_night_kill",
  abilityName: "奥乔",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 54,
  firstNightOnly: false,
  wakePromptId: "role.ojo.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
