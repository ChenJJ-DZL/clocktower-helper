/**
 * 亡骨魔（Vigormortis）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，你要选择一名玩家：他死亡。
 *   被你杀死的爪牙保留他的能力，且与他邻近的两名镇民之一中毒。
 *   [-1外来者]"
 *
 * 每夜杀一人。被杀的爪牙保留能力。邻近镇民中毒。
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
  // 检查目标是否为爪牙
  const target = ctx.snapshot.seats.find((s: any) => s.id === targetId);
  const isMinion = target?.role?.type === "minion";
  const poisonedTownsfolkId = ctx.storytellerInput?.poisonedTownsfolkId ?? null;
  const isProtected =
    target?.isProtected ||
    target?.statusEffects?.some((e: any) => e.type === "protected");
  const aliveCount = ctx.snapshot.seats.filter((s: any) => !s.isDead).length;
  const isSoldierImmune = isImmuneToDemonKill(target, true, aliveCount);

  let mayorSaved = false;
  let substituteId: number | null = null;
  let mayorResolution: any = null;

  if (target && !isProtected && !isSoldierImmune) {
    const mayorRes = resolveMayorDemonKill(
      ctx.snapshot.seats,
      target,
      aliveCount,
      undefined,
      ctx.storytellerInput?.mayorSubstituteId
    );
    if (mayorRes.isMayor) {
      console.log(`[Vigormortis] ${mayorRes.logMessage}`);
      mayorResolution = mayorRes;
      if (mayorRes.substituted && mayorRes.substituteSeat) {
        mayorSaved = true;
        substituteId = mayorRes.substituteSeat.id;
      }
    }
  }

  const killed = Boolean(target && !isProtected && !isSoldierImmune);

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
        minionKeepsAbility: isMinion && killed && !mayorSaved,
        poisonedTownsfolkId: isMinion && killed && !mayorSaved ? poisonedTownsfolkId : null,
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
        demonRole: "vigormortis",
        minionKeepsAbility: r.minionKeepsAbility,
      },
      vigormortisPoisonedTownsfolkId: r.poisonedTownsfolkId,
      // 🔧 修复：亡骨魔击杀目标必须落地死亡标记（与三恶魔一致）。
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
            killedBy: "vigormortis",
            deathSource: "vigormortis_kill",
            deathSourceSeatId: (ctx.actionNode as any)?.seatId ?? null,
            keepsAbilityDead: r.minionKeepsAbility,
          };
        }
        if (r.poisonedTownsfolkId != null && seat.id === r.poisonedTownsfolkId) {
          const effects = [...(updated.statusEffects ?? [])];
          if (!effects.some((e: any) => e.type === "poisoned" && e.source === "vigormortis")) {
            effects.push({
              type: "poisoned",
              source: "vigormortis",
              sourceSeatId: ctx.actionNode.seatId,
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
        vigormortis: r,
      },
    },
    meta: { ...ctx.meta, vigormortisResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  let log = "";
  if (r?.mayorSaved && r?.substituteId != null) {
    log = `[Vigormortis] 亡骨魔攻击了 ${r.targetId + 1} 号镇长，触发替死，由 ${r.substituteId + 1} 号替代死亡`;
  } else if (r?.targetId != null) {
    const minionNote = r?.minionKeepsAbility ? "（爪牙保留能力）" : "";
    log = `[Vigormortis] 击杀${r.targetId + 1}号${minionNote}`;
  } else {
    log = "[Vigormortis] 无目标";
  }
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【亡骨魔】，选择一名玩家杀害。`,
      abilityLog: log,
    },
  };
};

export const vigormortisAbility = createRoleAbility({
  roleId: "vigormortis",
  effectSemantics: "kill",
  abilityId: "vigormortis_kill",
  abilityName: "锁魂杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 53,
  firstNightOnly: false,
  wakePromptId: "role.vigormortis.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
