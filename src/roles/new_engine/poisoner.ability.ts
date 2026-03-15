/**
 * 毒药师（Poisoner）新引擎技能实现
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

// 状态更新：为目标玩家添加中毒效果
const updatePoisonStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds, meta, actionNode } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const targetId = targetIds?.[0];

  if (!isAbilityActive || !targetId) {
    return context;
  }

  // 创建新的快照，添加中毒状态
  const newSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat) => {
      if (seat.id === targetId) {
        return {
          ...seat,
          statusEffects: [
            ...seat.statusEffects.filter(
              (e: any) => !(e.type === "poisoned" && e.source === "poisoner")
            ),
            {
              type: "poisoned",
              source: "poisoner",
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

export const poisonerAbility = createRoleAbility({
  roleId: "poisoner",
  abilityId: "poisoner_night_ability",
  abilityName: "致命毒药",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 10,
  firstNightOnly: false,
  wakePromptId: "role.poisoner.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAliveAndStatus],
  calculate: [],
  stateUpdate: [updatePoisonStatus],
  postProcess: [
    async (context) => {
      const { meta, targetIds } = context;
      const targetId = targetIds?.[0];
      if (meta.isAbilityActive && targetId) {
        console.log(
          `毒药师选择对${targetId}号玩家下毒，该玩家技能将失效直至下一个夜晚结束`
        );
      }
      return context;
    },
  ],
});
