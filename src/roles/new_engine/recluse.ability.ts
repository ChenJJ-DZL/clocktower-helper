/**
 * 隐士（Recluse）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 隐士伪装效果：在被查验时可能被判定为邪恶角色
const applyDisguise = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat?.isAlive) {
    return context;
  }

  const isDrunk = seat.statusEffects.some((e: any) => e.type === "drunk");
  const isPoisoned = seat.statusEffects.some((e: any) => e.type === "poisoned");

  if (isDrunk || isPoisoned) {
    return context;
  }

  // 50%概率伪装成爪牙或恶魔
  const shouldDisguise = Math.random() < 0.5;
  if (shouldDisguise) {
    return {
      ...context,
      meta: {
        ...context.meta,
        disguiseAsEvil: true,
        disguiseRoleType: Math.random() < 0.7 ? "minion" : "demon",
      },
    };
  }

  return context;
};

export const recluseAbility = createRoleAbility({
  roleId: "recluse",
  abilityId: "recluse_disguise",
  abilityName: "伪装者",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: true,
  },
  preCheck: [],
  calculate: [applyDisguise],
  stateUpdate: [],
  postProcess: [],
});
