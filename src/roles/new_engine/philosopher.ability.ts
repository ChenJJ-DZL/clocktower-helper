/**
 * 哲学家（Philosopher）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 哲学家是镇民角色
// 首夜，你可以选择一个镇民角色，你获得该能力。如果你选择的角色在游戏中存在，他会醉酒。

export const philosopherAbility = createRoleAbility({
  roleId: "philosopher",
  abilityId: "philosopher_special_ability",
  abilityName: "智慧汲取",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 0,
  firstNightOnly: true,
  wakePromptId: "role.philosopher.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 哲学家的能力逻辑：选择镇民角色获取能力，让对应玩家醉酒
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 哲学家的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("哲学家能力被调用");
      return context;
    },
  ],
});
