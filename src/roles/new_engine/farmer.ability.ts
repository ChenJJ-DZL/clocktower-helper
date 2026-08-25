/**
 * 农夫（Farmer）新引擎技能实现（实验角色）
 *
 * 【角色能力】"如果你在夜晚死亡，一名存活的善良玩家会变成农夫。"
 *
 * PASSIVE 触发：夜晚死亡时，随机选择一名存活的善良玩家继承农夫角色。
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
  if (!seat) return { ...ctx, aborted: true, abortReason: "未找到座位" };

  const isDrunk =
    (seat.statusEffects ?? []).some((e: any) => e.type === "drunk") ||
    seat.isDrunk === true ||
    ctx.meta.isDrunk === true;
  const isPoisoned =
    (seat.statusEffects ?? []).some((e: any) => e.type === "poisoned") ||
    seat.isPoisoned === true ||
    ctx.meta.isPoisoned === true;
  const isAbilityActive = !(isDrunk || isPoisoned);

  // 只有在夜晚死亡才触发农夫传递
  const isNight =
    ctx.snapshot.gamePhase === "night" ||
    ctx.snapshot.gamePhase === "firstNight";
  const diedAtNight =
    isNight &&
    (seat.isDead || (ctx.snapshot.deadThisNight ?? []).includes(seat.id));

  if (!diedAtNight) {
    return { ...ctx, aborted: true, abortReason: "非夜晚死亡，不触发农夫传承" };
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      isDrunk,
      isPoisoned,
      isAbilityActive,
    },
  };
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const isAbilityActive = ctx.meta.isAbilityActive !== false;
  if (!isAbilityActive) {
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityResult: {
          newFarmerId: null,
          hasTransfer: false,
        },
        isCorrupted: true,
      },
    };
  }

  // 寻找存活的善良玩家（非邪恶类型）
  const goodCandidates = ctx.snapshot.seats.filter(
    (s: any) =>
      s.isAlive &&
      s.id !== ctx.actionNode.seatId &&
      s.role &&
      !s.isEvilConverted &&
      s.alignment !== "evil" &&
      s.role.type !== "minion" &&
      s.role.type !== "demon"
  );
  const chosen =
    goodCandidates.length > 0
      ? (ctx.storytellerInput?.newFarmerSeatId !== undefined
          ? ctx.snapshot.seats.find(
              (s: any) => s.id === ctx.storytellerInput.newFarmerSeatId
            )
          : goodCandidates[Math.floor(Math.random() * goodCandidates.length)])
      : null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        newFarmerId: chosen?.id ?? null,
        hasTransfer: chosen !== null,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.hasTransfer || r.newFarmerId == null) return ctx;
  const updatedSeats = ctx.snapshot.seats.map((s: any) => {
    if (s.id === r.newFarmerId) {
      return {
        ...s,
        role: { id: "farmer", name: "农夫", type: "townsfolk" },
        roleId: "farmer",
        roleName: "农夫",
        roleType: "townsfolk",
        statusDetails: [...(s.statusDetails || []), "成为新农夫"],
      };
    }
    return s;
  });
  return {
    ...ctx,
    meta: { ...ctx.meta, farmerResult: r },
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        farmer: r,
      },
    },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.hasTransfer) {
    console.log("[Farmer] 无可用继承目标");
    return ctx;
  }
  const log = `[Farmer] 农夫死亡，${r.newFarmerId + 1}号成为新农夫`;
  console.log(log);
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log } };
};

export const farmerAbility = createRoleAbility({
  roleId: "farmer",
  abilityId: "farmer_death_transfer",
  abilityName: "农夫继承",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: 85,
  firstNightOnly: false,
  wakePromptId: "role.farmer.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
