/**
 * 守夜人（Night Watchman）新引擎技能实现
 *
 * 【角色能力】"首夜，得知一名玩家的角色。"
 *
 * 首夜唤醒，选择一名玩家，得知其真实角色。
 * 醉酒/中毒时可能得知错误的角色信息。
 * 目标选择：1名玩家，不可选自己。
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

  const nightCount = ctx.snapshot.nightCount ?? 0;
  if (nightCount !== 1 && ctx.snapshot.gamePhase !== "firstNight") {
    return { ...ctx, aborted: true, abortReason: "非首夜，守夜人不唤醒" };
  }

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
  const effective = ctx.meta.abilityEffective ?? true;

  let roleName = "未知";
  if (targetId != null) {
    const target = ctx.snapshot.seats.find((s: any) => s.id === targetId);
    if (effective) {
      roleName = target?.role?.name ?? "未知";
    } else {
      const otherRoles = ctx.snapshot.seats
        .filter((s: any) => s.id !== targetId && s.role?.name)
        .map((s: any) => s.role.name);
      roleName =
        otherRoles.length > 0
          ? otherRoles[Math.floor(Math.random() * otherRoles.length)]
          : (target?.role?.name ?? "未知");
    }
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        roleName,
        isCorrupted: !effective,
        watchmanActive: true,
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
  const tag = r?.isCorrupted ? "【受干扰】" : "";
  const log = `[NightWatchman]${tag} ${targetLabel}的角色是${r?.roleName ?? "未知"}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【守夜人】，选择一名玩家查看其角色。`,
      abilityLog: log,
    },
  };
};

export const night_watchmanAbility = createRoleAbility({
  roleId: "night_watchman",
  abilityId: "night_watchman_first_night",
  abilityName: "守夜人",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: 73,
  otherNightPriority: 106,
  firstNightOnly: true,
  wakePromptId: "role.night_watchman.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
