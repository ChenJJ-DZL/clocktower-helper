/**
 * 哲学家（Philosopher）新引擎技能实现
 *
 * 【角色能力】首日一次，选择一个不在场的镇民角色，获得其能力。如果该角色在场，该玩家变成酒鬼。
 *
 * DAY触发，limited ability（每局一次）。
 * 选择角色而非玩家——从storytellerInput获取所选角色ID。
 * 若所选角色在场中，哲学家变成酒鬼；否则获得该角色的能力。
 */
import {
  canUseLimitedAbility,
  consumeLimitedAbility,
} from "../../utils/LimitedAbilityManager";
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否已使用能力
const preCheckLimitedAbility = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  if (!canUseLimitedAbility(ctx.actionNode.seatId, "philosopher_gain")) {
    return { ...ctx, aborted: true, abortReason: "哲学家已经使用过能力了" };
  }
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const chosenRoleId = ctx.storytellerInput?.chosenRoleId ?? null;

  const isCorrupted = ctx.meta.abilityEffective === false;

  if (!chosenRoleId) {
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        isCorrupted,
        abilityResult: {
          chosenRoleId: null,
          roleInPlay: false,
          becomesDrunk: false,
          used: false,
          isCorrupted,
        },
      },
    };
  }

  // 官方规则：如果该角色在场，该角色玩家醉酒；无论在场与否，哲学家获得该能力
  const duplicateSeat = ctx.snapshot.seats.find(
    (s: any) =>
      s.id !== ctx.actionNode.seatId &&
      (s.role?.id === chosenRoleId || s.originalRole?.id === chosenRoleId)
  );

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      isCorrupted,
      abilityResult: {
        chosenRoleId,
        roleInPlay: !!duplicateSeat,
        duplicateSeatId: duplicateSeat ? duplicateSeat.id : null,
        used: true,
        isCorrupted,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!ctx.aborted) {
    consumeLimitedAbility(ctx.actionNode.seatId, "philosopher_gain");
  }

  let nextSeats = ctx.snapshot.seats ?? [];
  if (r?.duplicateSeatId != null) {
    nextSeats = nextSeats.map((s: any) => {
      if (s.id === r.duplicateSeatId) {
        const effects = [...(s.statusEffects ?? [])];
        if (!effects.some((e: any) => e.type === "drunk" && e.source === "philosopher")) {
          effects.push({
            type: "drunk",
            source: "philosopher",
            sourceSeatId: ctx.actionNode.seatId,
          });
        }
        return {
          ...s,
          isDrunk: true,
          statusEffects: effects,
        };
      }
      return s;
    });
  }

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: nextSeats,
      philosopherGainedRole: r?.chosenRoleId,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        philosopher: r,
      },
    },
    meta: { ...ctx.meta, philosopherResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.used) {
    const log = "[哲学家] 未使用能力";
    console.log(log);
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        prompt: `唤醒${ctx.actionNode.seatId + 1}号【哲学家】，确认是否发动能力。`,
        abilityLog: log,
      },
    };
  }

  const isCorrupted = ctx.meta.isCorrupted ?? ctx.meta.abilityEffective === false;
  const tag = isCorrupted ? "【受干扰】" : "";
  let log: string;
  let prompt: string;
  if (r.roleInPlay) {
    log = `[哲学家]${tag} 获得了${r.chosenRoleId}的能力，但该角色在场，${(r.duplicateSeatId ?? 0) + 1}号玩家变成酒鬼`;
    prompt = `唤醒${ctx.actionNode.seatId + 1}号【哲学家】，获得了${r.chosenRoleId}的能力。由于该角色在场，${(r.duplicateSeatId ?? 0) + 1}号玩家变成酒鬼。`;
  } else {
    log = `[哲学家]${tag} 获得了${r.chosenRoleId}的能力`;
    prompt = `唤醒${ctx.actionNode.seatId + 1}号【哲学家】，获得了${r.chosenRoleId}的能力。`;
  }
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      isCorrupted,
      prompt,
      abilityLog: log,
      displayInfo: {
        type: "philosopher_gain",
        chosenRoleId: r.chosenRoleId,
        isCorrupted,
        log,
      },
    },
  };
};

export const philosopherAbility = createRoleAbility({
  roleId: "philosopher",
  abilityId: "philosopher_gain",
  abilityName: "哲人之力",
  triggerTiming: [AbilityTriggerTiming.DAY],
  firstNightPriority: 6,
  otherNightPriority: 4,
  firstNightOnly: false,
  wakePromptId: "role.philosopher.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive, preCheckLimitedAbility],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
