/**
 * 士兵（Soldier）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否存活、是否醉酒/中毒
const preCheckAliveAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }

  const isDrunk = seat.statusEffects.some((e: any) => e.type === "drunk");
  const isPoisoned = seat.statusEffects.some((e: any) => e.type === "poisoned");
  const killerRoleId = context.meta.killerRoleId as string;

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      isAbilityActive: !(isDrunk || isPoisoned),
      isDemonKill:
        killerRoleId === "imp" ||
        killerRoleId === "pukka" ||
        killerRoleId === "zombuul" ||
        killerRoleId === "shabaloth" ||
        killerRoleId === "po" ||
        killerRoleId === "vortox",
    },
  };
};

// 状态更新：免疫恶魔杀戮
const cancelDemonKill = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const isDemonKill = meta.isDemonKill ?? false;

  if (!isAbilityActive || !isDemonKill) {
    return context;
  }

  // 取消本次死亡效果
  const newSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat) => {
      if (seat.id === actionNode.seatId) {
        return {
          ...seat,
          isAlive: true,
          deathReason: undefined,
          deathPhase: undefined,
        };
      }
      return seat;
    }),
  };

  return { ...context, snapshot: newSnapshot };
};

export const soldierAbility = createRoleAbility({
  roleId: "soldier",
  abilityId: "soldier_passive_immunity",
  abilityName: "坚韧不拔",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAliveAndStatus],
  calculate: [],
  stateUpdate: [cancelDemonKill],
  postProcess: [
    async (context) => {
      const { meta } = context;
      if (meta.isAbilityActive && meta.isDemonKill) {
        console.log("士兵免疫了恶魔的杀戮，存活了下来");
      }
      return context;
    },
  ],
});
