/**
 * 工程师（Engineer）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 工程师是镇民角色
// 首夜，你可以选择3个角色，说书人会从中选择一个作为游戏中的爪牙。

export const engineerAbility = createRoleAbility({
  roleId: "engineer",
  abilityId: "engineer_special_ability",
  abilityName: "爪牙改造",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 0,
  firstNightOnly: true,
  wakePromptId: "role.engineer.wake",
  targetConfig: {
    min: 3,
    max: 3,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 工程师的能力逻辑：选择3个候选爪牙角色
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 工程师的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("工程师能力被调用");
      return context;
    },
  ],
});
