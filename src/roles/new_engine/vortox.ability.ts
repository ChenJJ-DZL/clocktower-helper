/**
 * 涡流（Vortox）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，你要选择一名玩家：他死亡。
 *   镇民玩家的能力都会产生错误信息。
 *   如果白天没人被处决，邪恶阵营获胜。"
 *
 * 每夜杀一人。所有镇民能力结果反转。无处决日邪恶获胜。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";
import {
  isImmuneToDemonKill,
  resolveMayorDemonKill,
} from "../../utils/soldierImmunity";

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
  if (targetId === null) {
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityResult: { targetId: null, killed: false, vortoxActive: true },
      },
    };
  }

  const targetSeat = ctx.snapshot.seats.find((s: any) => s.id === targetId);
  const isProtected =
    targetSeat?.isProtected ||
    targetSeat?.statusEffects?.some((e: any) => e.type === "protected");
  const aliveCount = ctx.snapshot.seats.filter((s: any) => !s.isDead).length;
  const isSoldierImmune = isImmuneToDemonKill(targetSeat, true, aliveCount);

  let mayorSaved = false;
  let substituteId: number | null = null;
  let mayorResolution: any = null;

  if (targetSeat && !isProtected && !isSoldierImmune) {
    const mayorRes = resolveMayorDemonKill(
      ctx.snapshot.seats,
      targetSeat,
      aliveCount,
      undefined,
      ctx.storytellerInput?.mayorSubstituteId
    );
    if (mayorRes.isMayor) {
      console.log(`[Vortox] ${mayorRes.logMessage}`);
      mayorResolution = mayorRes;
      if (mayorRes.substituted && mayorRes.substituteSeat) {
        mayorSaved = true;
        substituteId = mayorRes.substituteSeat.id;
      }
    }
  }

  const killed = Boolean(targetSeat && !isProtected && !isSoldierImmune);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        killed,
        mayorSaved,
        substituteId,
        mayorResolution,
        vortoxActive: true,
        blockedByProtection: isProtected,
        blockedBySoldier: isSoldierImmune,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const actualKilledId = r?.mayorSaved ? r?.substituteId : r?.targetId;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      lastKill: {
        demonId: ctx.actionNode.seatId,
        targetId: actualKilledId,
        demonRole: "vortox",
        killed: r?.killed ?? false,
      },
      vortoxActive: true,
      seats: ctx.snapshot.seats.map((seat: any) => {
        // 镇长替死：镇长存活
        if (r?.mayorSaved && seat.id === r.targetId) {
          return seat;
        }
        // 替死者替代死亡
        if (r?.substituteId != null && seat.id === r.substituteId) {
          return {
            ...seat,
            isAlive: false,
            isDead: true,
            markedForDeath: true,
            diedAtNight: ctx.snapshot.nightCount,
            killedBy: "mayor_substitute",
            deathSource: "mayor_substitute",
            deathSourceSeatId: (ctx.actionNode as any)?.seatId ?? null,
          };
        }
        // 正常被涡流击杀
        if (r?.killed && seat.id === r.targetId && !seat.isDead) {
          return {
            ...seat,
            isAlive: false,
            isDead: true,
            markedForDeath: true,
            diedAtNight: ctx.snapshot.nightCount,
            killedBy: "vortox",
            deathSource: "vortox_kill",
            deathSourceSeatId: (ctx.actionNode as any)?.seatId ?? null,
          };
        }
        return seat;
      }),
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        vortox: r,
      },
    },
    meta: { ...ctx.meta, vortoxResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  let log = "";
  if (r?.mayorSaved && r?.substituteId != null) {
    log = `[Vortox] 涡流攻击了 ${r.targetId + 1} 号镇长，触发替死，由 ${r.substituteId + 1} 号替代死亡`;
  } else if (r?.killed) {
    log = `[Vortox] 涡流击杀了 ${r.targetId + 1} 号`;
  } else if (r?.blockedByProtection) {
    log = `[Vortox] 涡流攻击了 ${r.targetId + 1} 号，但目标受到保护`;
  } else if (r?.blockedBySoldier) {
    log = `[Vortox] 涡流攻击了 ${r.targetId + 1} 号士兵，免疫击杀`;
  } else {
    log = "[Vortox] 涡流未产生击杀";
  }
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【涡流】，选择一名玩家杀害。`,
      abilityLog: log,
    },
  };
};

export const vortoxAbility = createRoleAbility({
  roleId: "vortox",
  effectSemantics: "kill",
  abilityId: "vortox_kill",
  abilityName: "混沌杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 52,
  firstNightOnly: false,
  wakePromptId: "role.vortox.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
