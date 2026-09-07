/**
 * 农夫（Farmer）新引擎技能实现（实验角色）
 *
 * 【官方百科能力】"当你在夜晚死亡时，一名存活的善良玩家会变成农夫。"
 *
 * 运作方式：
 * - 只有在夜晚死亡才触发农夫传承。白天处决或白天暴毙不触发。
 * - 随机选择一名存活的善良玩家继承农夫角色（间谍若被当作善良也可被选中，但保持其实际阵营）。
 * - 被选中的善良玩家角色变为农夫，失去原有能力。
 * - 如果多名农夫连续或在同一夜晚死亡，多次传承，场上可有多个农夫（含已死亡农夫）。
 * - 醉酒或中毒时不触发传承。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";
import { getEligibleFarmerSuccessors } from "../../utils/expansionMechanics";

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
    (seat.isDead ||
      (ctx.snapshot.deadThisNight ?? []).includes(seat.id) ||
      (ctx.actionNode as any).diedAtNight === true);

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

  // 获取所有合格的存活善良玩家（考虑间谍等）
  const eligibleCandidates = getEligibleFarmerSuccessors(
    ctx.snapshot.seats,
    ctx.actionNode.seatId
  );

  let chosen: any = null;
  if (ctx.storytellerInput?.newFarmerSeatId !== undefined) {
    chosen = ctx.snapshot.seats.find(
      (s: any) => s.id === ctx.storytellerInput.newFarmerSeatId
    );
  } else if (eligibleCandidates.length > 0) {
    chosen = eligibleCandidates[Math.floor(Math.random() * eligibleCandidates.length)];
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        newFarmerId: chosen?.id ?? null,
        hasTransfer: chosen != null,
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
      const cleanedStatusEffects = (s.statusEffects ?? []).filter(
        (e: any) =>
          ![
            "farmer_ability",
            "cannibal_farmer",
            "philosopher_farmer",
            "pixie_farmer",
          ].includes(e.type)
      );
      // 农夫角色本身的类型永远是 townsfolk（镇民角色）
      // 若间谍被转为农夫，保持其实际邪恶阵营（isEvilConverted: true 或保持 evil 标记）
      const isOriginalEvil = s.role?.type === "minion" || s.role?.type === "demon" || s.isEvilConverted || s.alignment === "evil";
      return {
        ...s,
        role: {
          id: "farmer",
          name: "农夫",
          type: "townsfolk",
        },
        roleId: "farmer",
        roleName: "农夫",
        roleType: "townsfolk",
        isEvilConverted: isOriginalEvil ? true : s.isEvilConverted,
        alignment: isOriginalEvil ? "evil" : s.alignment,
        hasAbilityEvenDead: false,
        statusEffects: cleanedStatusEffects,
        acquiredAbilities: [],
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
  const log = `[Farmer] 农夫在夜晚死亡，${r.newFarmerId + 1}号玩家转变为新农夫！`;
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
