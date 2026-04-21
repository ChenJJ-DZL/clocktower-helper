/**
 * 告密者（Snitch）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 告密者是被动能力角色
// 爪牙会在其首个夜晚得知三个伪装

export const snitchAbility = createRoleAbility({
  roleId: "snitch",
  abilityId: "snitch_passive_ability",
  abilityName: "爪牙获伪装",
  triggerTiming: [AbilityTriggerTiming.PASSIVE], // 被动能力
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.snitch.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 告密者是被动能力，不需要主动计算逻辑
      // 他的效果是让爪牙在首夜得知三个伪装
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 告密者的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("告密者能力（被动）被调用");
      return context;
    },
  ],
});
