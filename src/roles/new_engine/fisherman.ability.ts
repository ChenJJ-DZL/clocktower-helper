/**
 * 渔夫（Fisherman）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 渔夫是白天能力角色
// 他的能力在白天时拜访说书人获取建议
// 这是一个限次能力，每局游戏限一次

export const fishermanAbility = createRoleAbility({
  roleId: "fisherman",
  abilityId: "fisherman_day_ability",
  abilityName: "获取建议",
  triggerTiming: [AbilityTriggerTiming.DAY], // 白天能力
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.fisherman.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 渔夫的能力不需要计算逻辑
      // 说书人会给渔夫提供建议
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 渔夫使用能力后标记失去能力
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("渔夫能力被调用");
      return context;
    },
  ],
});
