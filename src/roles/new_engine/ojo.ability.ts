/**
 * 奥乔（Ojo）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，选择一个角色：该角色的玩家死亡。
 *   如果该角色不在场，说书人选择谁死亡。"
 *
 * 按角色名狙杀，不是按玩家选择。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";
import { resolveMayorDemonKill } from "../../utils/soldierImmunity";

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

  let mayorSaved = false;
  let substituteId: number | null = null;
  let mayorResolution: any = null;

  if (finalTargetId != null) {
    const chosenSeat = seats.find((s: any) => s.id === finalTargetId);
    const aliveCount = seats.filter((s: any) => !s.isDead).length;
    if (chosenSeat) {
      const mayorRes = resolveMayorDemonKill(
        seats,
        chosenSeat,
        aliveCount,
        undefined,
        ctx.storytellerInput?.mayorSubstituteId
      );
      if (mayorRes.isMayor) {
        console.log(`[Ojo] ${mayorRes.logMessage}`);
        mayorResolution = mayorRes;
        if (mayorRes.substituted && mayorRes.substituteSeat) {
          mayorSaved = true;
          substituteId = mayorRes.substituteSeat.id;
        }
      }
    }
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetRoleId,
        targetSeatId: finalTargetId,
        mayorSaved,
        substituteId,
        mayorResolution,
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
  const actualKilledId = r?.mayorSaved ? r?.substituteId : r?.targetSeatId;
  const updatedSeats = seats.map((s: any) => {
    if (r?.mayorSaved && s.id === r.targetSeatId) {
      return s;
    }
    if (r?.substituteId != null && s.id === r.substituteId) {
      return {
        ...s,
        isDead: true,
        isAlive: false,
        markedForDeath: true,
        diedAtNight: ctx.snapshot.nightCount,
        killedBy: "mayor_substitute",
        deathSource: "mayor_substitute",
        deathSourceSeatId: (ctx.actionNode as any)?.seatId ?? null,
      };
    }
    if (s.id === r.targetSeatId) {
      return {
        ...s,
        isDead: true,
        isAlive: false,
        markedForDeath: true,
        diedAtNight: ctx.snapshot.nightCount,
        killedBy: "ojo",
        deathSource: "ojo",
        deathSourceSeatId: (ctx.actionNode as any)?.seatId ?? null,
      };
    }
    return s;
  });
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      lastKill: {
        demonId: ctx.actionNode.seatId,
        targetId: actualKilledId,
        demonRole: "ojo",
      },
      seats: updatedSeats,
    },
    meta: { ...ctx.meta, ojoResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  let log = "";
  if (r?.mayorSaved && r?.substituteId != null) {
    log = `[Ojo] 奥乔狙杀触发镇长替死，由 ${r.substituteId + 1}号替代死亡`;
  } else if (r?.targetSeatId != null) {
    log = `[Ojo] 奥乔击杀 ${r.targetSeatId + 1}号（${r.targetRoleId ?? "说书人指定"}）`;
  } else {
    log = "[Ojo] 奥乔无目标";
  }
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
