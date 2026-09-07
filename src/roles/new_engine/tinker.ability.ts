/**
 * 修补匠（Tinker）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

import { isProtectedByTeaLady } from "../../utils/bmrMechanics";

// 前置校验：修补匠是被动能力，主要由说书人手动触发
const preCheckPassive = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 修补匠的能力是被动的，主要由说书人在需要时手动触发
  return { ...context, meta: { ...context.meta, isPassive: true } };
};

// 计算结果：修补匠随时可能死亡，但受保护时不能死亡
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const tinkerSeat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  const wantsToKill = context.storytellerInput?.shouldKillTinker ?? false;

  // 检查是否受到茶艺师或旅店老板保护
  const isProtected =
    (tinkerSeat?.statusEffects ?? []).some((e: any) => e.type === "protected") ||
    (tinkerSeat as any)?.isProtected === true ||
    isProtectedByTeaLady(actionNode.seatId, snapshot.seats);

  const shouldDie = wantsToKill && !isProtected;

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: {
        tinkerSeatId: actionNode.seatId,
        isAlive: tinkerSeat?.isAlive ?? true,
        isProtected,
        shouldDie,
      },
    },
  };
};

const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, snapshot } = context;
  const result = meta.abilityResult as any;

  if (!result?.shouldDie) return context;

  const seats = snapshot.seats.map((seat) => {
    if (seat.id === result.tinkerSeatId && !seat.isDead) {
      return {
        ...seat,
        isAlive: false,
        isDead: true,
        diedAtNight: snapshot.nightCount,
        deathSource: "tinker_sudden_death",
        killedBy: "tinker",
      };
    }
    return seat;
  });

  return {
    ...context,
    snapshot: {
      ...snapshot,
      seats,
      _abilityResults: {
        ...((snapshot as any)._abilityResults ?? {}),
        tinker: result,
      },
    },
  };
};

export const tinkerAbility = createRoleAbility({
  roleId: "tinker",
  abilityId: "tinker_passive_ability",
  abilityName: "猝死",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: 74,
  firstNightOnly: false,
  wakePromptId: "role.tinker.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckPassive],
  calculate: [calculateResult],
  stateUpdate: [stateUpdate],
  postProcess: [
    async (context) => {
      const { meta } = context;
      const result = meta.abilityResult;
      if (result.shouldDie) {
        console.log(`修补匠（${result.tinkerSeatId + 1}号）突然暴毙死亡`);
      }
      return context;
    },
  ],
});
