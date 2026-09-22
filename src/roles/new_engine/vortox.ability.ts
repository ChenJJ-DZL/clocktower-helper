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
  if (!seat || seat.isDead) return { ...ctx, aborted: true, abortReason: "已死亡" };
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
      ctx.storytellerInput?.mayorSubstituteId,
        `mayorKill|${(ctx.snapshot as any)?.nightCount ?? 0}|vortox`
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
  // ⚠️⚠️ 2026-09-21 修复 P0：涡流自身醉酒/中毒时必须 **不下杀手**。
  //
  // 官方原文（投毒者 / 规则书「醉酒与中毒」）：
  //   "中毒的玩家会失去能力……他的能力**不会真实地影响游戏**。"
  //   "如果一名中毒的玩家……使用了能力，他无法再次使用这项能力。"（走场原则）
  // ⇒ 被投毒者下毒的涡流，仍会被唤醒、仍会被要求选人（说书人装作他还有能力），
  //   **但选中的玩家不会死**。
  //
  // 实测证据（2026-09-21 探针 zz_probe_drunk_effect_gate）：
  //   修复前 drunk=true（醉酒涡流照样杀人）—— 与 imp/monk 的正确行为相反。
  //
  // 实现：abilityEffective=false 时只记录选择（供说书人核对 / UI 展示），
  //       绝不写 isDead / markedForDeath / lastKill.killed。
  const abilityEffective = ctx.meta.abilityEffective ?? true;
  const actualKilledId = r?.mayorSaved ? r?.substituteId : r?.targetId;

  if (!abilityEffective) {
    return {
      ...ctx,
      snapshot: {
        ...ctx.snapshot,
        // 涡流世界标记仍照常（涡流在世界中即成立，与本次击杀是否生效无关）
        vortoxActive: true,
        // lastKill 仍要写（killed:false）—— 说书人据此播报「平安夜」，
        // 不写会让下游「昨晚发生了什么」无处可读（与 imp 的记录选择 一致）。
        lastKill: {
          demonId: ctx.actionNode.seatId,
          targetId: null,
          demonRole: "vortox",
          killed: false,
        },
        _abilityResults: {
          ...((ctx.snapshot as any)._abilityResults ?? {}),
          vortox: { ...r, killed: false, blockedByDrunkOrPoison: true },
        },
      },
      meta: {
        ...ctx.meta,
        vortoxResult: { ...r, killed: false },
        isCorrupted: true,
      },
    };
  }

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

  // 🎯 结算 UI 数据：此前涡流只设 abilityLog、无 displayInfo，
  //    结果页拿不到结构化内容（选目标结算通道实测：displayInfo === undefined）。
  const targetId: number | null = r?.targetId ?? null;
  const targetLabel = targetId !== null ? `${targetId + 1}号` : "无";
  const substituteId: number | null = r?.substituteId ?? null;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【涡流】，选择一名玩家杀害。`,
      abilityLog: log,
      displayInfo: {
        type: "vortox_kill",
        targetId,
        targetLabel,
        killed: Boolean(r?.killed),
        blockedByProtection: Boolean(r?.blockedByProtection),
        blockedBySoldier: Boolean(r?.blockedBySoldier),
        mayorSaved: Boolean(r?.mayorSaved),
        substituteId,
        substituteLabel: substituteId !== null ? `${substituteId + 1}号` : null,
        nightCount: (ctx.snapshot as any)?.nightCount ?? null,
        log,
      },
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
