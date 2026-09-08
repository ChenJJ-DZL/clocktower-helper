/**
 * 诺-达鲺（No Dashii）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，你要选择一名玩家：他死亡。
 *   与你邻近的两名镇民中毒。"
 *
 * 每夜杀一人。邻近镇民中毒。
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
  const seats = ctx.snapshot.seats;
  const selfId = ctx.actionNode.seatId;
  if (targetId === null) {
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityResult: { targetId: null, killed: false },
      },
    };
  }

  const targetSeat = seats.find((s: any) => s.id === targetId);
  const isProtected =
    targetSeat?.isProtected ||
    targetSeat?.statusEffects?.some((e: any) => e.type === "protected");
  const aliveCount = seats.filter((s: any) => !s.isDead).length;
  const isSoldierImmune = isImmuneToDemonKill(targetSeat, true, aliveCount);

  let mayorSaved = false;
  let substituteId: number | null = null;
  let mayorResolution: any = null;

  if (targetSeat && !isProtected && !isSoldierImmune) {
    const mayorRes = resolveMayorDemonKill(
      seats,
      targetSeat,
      aliveCount,
      undefined,
      ctx.storytellerInput?.mayorSubstituteId
    );
    if (mayorRes.isMayor) {
      console.log(`[NoDashii] ${mayorRes.logMessage}`);
      mayorResolution = mayorRes;
      if (mayorRes.substituted && mayorRes.substituteSeat) {
        mayorSaved = true;
        substituteId = mayorRes.substituteSeat.id;
      }
    }
  }

  const killed = Boolean(targetSeat && !isProtected && !isSoldierImmune);

  const { getNoDashiiPoisonTargets } = await import("../../utils/snvMechanics");
  const poisonedAdjacent = getNoDashiiPoisonTargets(selfId, seats);
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
        poisonedAdjacent,
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
  if (!r?.killed) return ctx;
  const actualKilledId = r?.mayorSaved ? r?.substituteId : r?.targetId;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      lastKill: {
        demonId: ctx.actionNode.seatId,
        targetId: actualKilledId,
        demonRole: "no_dashii",
      },
      noDashiiPoisoned: r.poisonedAdjacent,
      // 🔧 修复：诺-达击杀目标必须落地死亡标记（与三恶魔一致）。
      //   syncStatusEffectsToSeat 只认 markedForDeath/isAlive===false → isDead，
      //   否则夜晚报告永远"平安夜"、死亡标记缺失、送葬者失效。
      seats: ctx.snapshot.seats.map((seat: any) => {
        let updated = seat;
        // 镇长替死：镇长存活
        if (r?.mayorSaved && seat.id === r.targetId) {
          // 镇长存活
        } else if (r?.substituteId != null && seat.id === r.substituteId) {
          updated = {
            ...updated,
            isAlive: false,
            isDead: true,
            markedForDeath: true,
            diedAtNight: ctx.snapshot.nightCount,
            killedBy: "mayor_substitute",
            deathSource: "mayor_substitute",
            deathSourceSeatId: (ctx.actionNode as any)?.seatId ?? null,
          };
        } else if (seat.id === r.targetId && !seat.isDead) {
          updated = {
            ...updated,
            isAlive: false,
            isDead: true,
            markedForDeath: true,
            diedAtNight: ctx.snapshot.nightCount,
            killedBy: "no_dashii",
            deathSource: "no_dashii_kill",
            deathSourceSeatId: (ctx.actionNode as any)?.seatId ?? null,
          };
        }
        if (r.poisonedAdjacent?.includes(seat.id)) {
          const effects = [...(updated.statusEffects ?? [])];
          if (!effects.some((e: any) => e.type === "poisoned" && e.source === "no_dashii")) {
            effects.push({
              type: "poisoned",
              source: "no_dashii",
              sourceSeatId: (ctx.actionNode as any)?.seatId ?? null,
            });
          }
          updated = {
            ...updated,
            isPoisoned: true,
            statusEffects: effects,
          };
        }
        return updated;
      }),
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        no_dashii: r,
      },
    },
    meta: { ...ctx.meta, noDashiiResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  let log = "";
  if (r?.mayorSaved && r?.substituteId != null) {
    log = `[NoDashii] 诺-达鲺攻击了 ${r.targetId + 1} 号镇长，触发替死，由 ${r.substituteId + 1} 号替代死亡，邻近${r.poisonedAdjacent?.length ?? 0}名镇民中毒`;
  } else if (r?.targetId != null) {
    log = `[NoDashii] 击杀${r.targetId + 1}号，邻近${r.poisonedAdjacent?.length ?? 0}名镇民中毒`;
  } else {
    log = "[NoDashii] 无目标";
  }
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【诺-达鲺】，选择一名玩家杀害。`,
      abilityLog: log,
    },
  };
};

export const no_dashiiAbility = createRoleAbility({
  roleId: "no_dashii",
  effectSemantics: "kill",
  abilityId: "no_dashii_kill",
  abilityName: "毒素杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 51,
  firstNightOnly: false,
  wakePromptId: "role.no_dashii.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
