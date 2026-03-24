/**
 * 毒药师（Poisoner）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 状态更新：为目标玩家添加中毒效果
const updatePoisonStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds, meta, actionNode } = context;
  const abilityEffective = meta.abilityEffective ?? true;
  const targetId = targetIds?.[0];

  if (!abilityEffective || !targetId) {
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
  preCheck: [], // 默认使用commonPreCheckAlive
  calculate: [],
  stateUpdate: [updatePoisonStatus],
  postProcess: [
    async (context) => {
      const { meta, targetIds } = context;
      const targetId = targetIds?.[0];
      if (meta.abilityEffective && targetId) {
        console.log(
          `毒药师选择对${targetId}号玩家下毒，该玩家技能将失效直至下一个夜晚结束`
        );
      }
      return context;
    },
  ],
});
