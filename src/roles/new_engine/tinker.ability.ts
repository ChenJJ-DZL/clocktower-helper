/**
 * 修补匠（Tinker）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：修补匠是被动能力，主要由说书人手动触发
const preCheckPassive = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 修补匠的能力是被动的，主要由说书人在需要时手动触发
  return { ...context, meta: { ...context.meta, isPassive: true } };
};

// 计算结果：修补匠随时可能死亡，这是一个说书人手动触发的能力
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 修补匠的死亡逻辑主要在说书人控制面板中实现
  // 这里主要记录修补匠的状态信息
  const { snapshot, actionNode } = context;
  const tinkerSeat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: {
        tinkerSeatId: actionNode.seatId,
        isAlive: tinkerSeat?.isAlive ?? true,
        // 说书人可以随时决定是否让修补匠死亡
        shouldDie: context.storytellerInput?.shouldKillTinker ?? false,
      },
    },
  };
};

export const tinkerAbility = createRoleAbility({
  roleId: "tinker",
  abilityId: "tinker_passive_ability",
  abilityName: "猝死",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 999,
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
  stateUpdate: [],
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
