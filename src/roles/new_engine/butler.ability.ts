/**
 * 管家（Butler）新引擎技能实现
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

// 状态更新：设置管家的主人
const updateMasterStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds, meta, actionNode } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const masterId = targetIds?.[0];

  if (!isAbilityActive || !masterId) {
    return context;
  }

  // 创建新的快照，更新管家的主人信息
  const newSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat) => {
      if (seat.id === actionNode.seatId) {
        return {
          ...seat,
          masterId,
          statusEffects: [
            ...seat.statusEffects.filter(
              (e: any) => e.type !== "butler_master"
            ),
            {
              type: "butler_master",
              source: "butler",
              masterId,
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

export const butlerAbility = createRoleAbility({
  roleId: "butler",
  abilityId: "butler_night_ability",
  abilityName: "仆从效忠",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 20,
  firstNightOnly: false,
  wakePromptId: "role.butler.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAliveAndStatus],
  calculate: [],
  stateUpdate: [updateMasterStatus],
  postProcess: [
    async (context) => {
      const { meta, targetIds, actionNode } = context;
      const masterId = targetIds?.[0];
      if (meta.isAbilityActive && masterId) {
        console.log(
          `管家${actionNode.seatId}号玩家选择${masterId}号玩家作为今天的主人，投票时必须跟随主人的选择`
        );
      }
      return context;
    },
  ],
});
