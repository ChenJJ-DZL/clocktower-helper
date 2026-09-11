/**
 * 军团（Legion）新引擎技能实现
 *
 * 【角色能力】
 * "每个夜晚*，可能有一名玩家死亡。如果一项提名只有邪恶玩家投票，投票无效。你也会被当作是爪牙。[多数玩家为军团]"
 *
 * 【运作方式】
 * - 除首个夜晚以外的每个夜晚，由说书人决定今晚哪一名玩家死亡（通常建议每晚击杀一名军团以维持游戏平衡至最终日3人对局）。
 * - 支持僧侣保护、水手保护、士兵免疫等常规防刀机制。
 */

import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  getDemonKillImmunityType,
  isImmuneToDemonKill,
  resolveMayorDemonKill,
} from "../../utils/soldierImmunity";
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
  const targetId = ctx.targetIds?.[0];
  if (targetId === undefined || targetId === null) {
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityResult: {
          killedPlayerId: null,
          isBlocked: false,
          reason: "说书人选择今晚无人死亡（空刀）",
        },
      },
    };
  }

  const seats = ctx.snapshot.seats;
  const target = seats.find((s: any) => s.id === targetId);
  if (!target || target.isDead) {
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityResult: {
          killedPlayerId: null,
          isBlocked: true,
          reason: "目标无效或已死亡",
        },
      },
    };
  }

  // 检查恶魔击杀免疫（士兵、受保护者等）
  if (isImmuneToDemonKill(target)) {
    const immType = getDemonKillImmunityType(target);
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityResult: {
          killedPlayerId: null,
          isBlocked: true,
          targetId,
          reason: `目标受到保护（${immType}），免于死亡`,
        },
      },
    };
  }

  // 市长弹刀判定
  const mayorResult = resolveMayorDemonKill(
    seats,
    target,
    undefined,
    undefined,
    ctx.storytellerInput?.mayorSubstituteId
  );
  if (mayorResult.substituted && mayorResult.substituteSeat) {
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityResult: {
          killedPlayerId: mayorResult.substituteSeat.id,
          originalTargetId: targetId,
          isRedirected: true,
          reason: "市长转嫁伤害至替代目标",
        },
      },
    };
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        killedPlayerId: targetId,
        isBlocked: false,
        reason: "军团夜杀成功",
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const result = ctx.meta.abilityResult as any;
  if (
    !result ||
    result.killedPlayerId === null ||
    result.killedPlayerId === undefined
  ) {
    return ctx;
  }

  const victimId = result.killedPlayerId;
  // 🔧 军团死亡必须与其它击杀角色（imp 等）写同样的字段：
  //   只写 markedForDeath 时，如果该座位没走到 syncStatusEffectsToSeat 的翻译，
  //   isDead 就不会落地 → useNightActionHandler 的 prev/new isDead 补记逻辑不触发
  //   → deadThisNight 永远为空 → 天亮播报错误地宣布「平安夜」（用户实测：军团局有人死亡仍报平安夜）。
  //   因此这里同时落地 isDead / isAlive，并显式补记 deadThisNight。
  const prevDeadThisNight: number[] = (ctx.snapshot as any).deadThisNight ?? [];
  const nextDeadThisNight = prevDeadThisNight.includes(victimId)
    ? prevDeadThisNight
    : [...prevDeadThisNight, victimId];

  const nextSeats = ctx.snapshot.seats.map((s: any) => {
    if (s.id === victimId) {
      return {
        ...s,
        isDead: true,
        isAlive: false,
        markedForDeath: true,
        deathSource: "demon",
        deathSourceSeatId: (ctx.actionNode as any)?.seatId ?? -1,
      };
    }
    return s;
  });

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      deadThisNight: nextDeadThisNight,
      seats: nextSeats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        legion: result,
      },
    },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const result = ctx.meta.abilityResult as any;
  const victimId = result?.killedPlayerId;
  const log =
    victimId !== null && victimId !== undefined
      ? `[军团夜杀] 说书人决定：${victimId + 1}号玩家今晚死亡`
      : `[军团夜杀] 说书人决定：今晚无人死亡（${result?.reason || "空刀"}）`;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
    },
  };
};

export const legionAbility = createRoleAbility({
  roleId: "legion",
  abilityId: "legion_night_kill",
  abilityName: "军团夜杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 44,
  firstNightOnly: false,
  wakePromptId: "prompt.legion.wake",
  targetConfig: {
    min: 0,
    max: 1,
    allowSelf: true,
    allowDead: false,
  },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
