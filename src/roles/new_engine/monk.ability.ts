/**
 * 僧侣（Monk）新引擎技能实现
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

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      isAbilityActive: !(isDrunk || isPoisoned),
    },
  };
};

// 状态更新：为目标玩家添加保护效果
const updateProtectionStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds, meta, actionNode } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const targetId = targetIds?.[0];

  if (!isAbilityActive || !targetId) {
    return context;
  }

  // 创建新的快照，添加保护状态
  const newSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat) => {
      if (seat.id === targetId) {
        return {
          ...seat,
          statusEffects: [
            ...seat.statusEffects,
            {
              type: "protected",
              source: "monk",
              sourceSeatId: actionNode.seatId,
              expiresAtNight: snapshot.nightCount + 1,
            },
          ],
        };
      }
      return seat;
    }),
  };

  return { ...context, snapshot: newSnapshot };
};

export const monkAbility = createRoleAbility({
  roleId: "monk",
  abilityId: "monk_night_ability",
  abilityName: "神圣保护",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 25,
  firstNightOnly: false,
  wakePromptId: "role.monk.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAliveAndStatus],
  calculate: [],
  stateUpdate: [updateProtectionStatus],
  postProcess: [
    async (context) => {
      const { meta, targetIds } = context;
      const targetId = targetIds?.[0];
      if (meta.isAbilityActive && targetId) {
        console.log(`僧侣选择保护${targetId}号玩家，该玩家今晚不会被恶魔杀死`);
      }
      return context;
    },
  ],
});
