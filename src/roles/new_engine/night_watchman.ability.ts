/**
 * 守夜人（Night Watchman）新引擎技能实现
 *
 * 【官方角色能力】"每局游戏限一次，在夜晚时，你可以选择一名玩家：他会得知你是守夜人。"
 *
 * 唤醒守夜人，选择一名玩家：该玩家被唤醒得知守夜人是谁。
 * targetConfig: min: 1, max: 1
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };

  const effects =
    seat.statusEffects ?? ctx.snapshot.statusEffects?.[seat.id] ?? [];
  const isDrunk = effects.some((e: any) => e.type === "drunk");
  const isPoisoned = effects.some((e: any) => e.type === "poisoned");

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      isDrunk,
      isPoisoned,
      abilityEffective: !(isDrunk || isPoisoned),
    },
  };
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  const selfSeatId = ctx.actionNode.seatId;
  const effective = ctx.meta.abilityEffective ?? true;

  if (targetId == null) {
    return { ...ctx, aborted: true, abortReason: "未选择目标" };
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        actorSeatId: selfSeatId,
        targetId,
        effective,
        isCorrupted: !effective,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const targetId = r?.targetId;
  const actorSeatId = r?.actorSeatId;

  // 记录守夜人已使用能力
  const updatedSeats = ctx.snapshot.seats.map((s: any) => {
    if (s.id === actorSeatId) {
      return {
        ...s,
        hasUsedNightWatchman: true,
        statusDetails: [
          ...(s.statusDetails || []).filter((d: string) => d !== "已使用守夜人技能"),
          "已使用守夜人技能",
        ],
      };
    }
    if (s.id === targetId && r?.effective) {
      return {
        ...s,
        statusDetails: [
          ...(s.statusDetails || []).filter((d: any) => typeof d === "string" ? !d.startsWith("得知守夜人:") : true),
          `得知守夜人:${actorSeatId + 1}号`,
        ],
      };
    }
    return s;
  });

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        night_watchman: r,
      },
    },
    meta: { ...ctx.meta, watchmanResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const targetLabel = r?.targetId != null ? `${r.targetId + 1}号` : "无";
  const actorLabel = `${r?.actorSeatId + 1}号`;
  const tag = r?.isCorrupted ? "【受干扰】" : "";
  const log = `[NightWatchman]${tag} 守夜人(${actorLabel})选择了${targetLabel}，${targetLabel}得知${actorLabel}是守夜人`;
  console.log(log);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `守夜人选择了${targetLabel}。请唤醒${targetLabel}并告知其【${actorLabel}是守夜人】。`,
      abilityLog: log,
      displayInfo: {
        type: "info",
        log,
      },
    },
  };
};

export const night_watchmanAbility = createRoleAbility({
  roleId: "night_watchman",
  abilityId: "night_watchman_ability",
  abilityName: "守夜人",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT, AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 73,
  otherNightPriority: 106,
  firstNightOnly: false,
  wakePromptId: "role.night_watchman.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
