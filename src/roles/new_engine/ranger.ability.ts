/**
 * 游侠（Ranger）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 游侠是镇民角色
// 每个夜晚，你可以选择两名玩家。如果恶魔要杀死其中一个，恶魔会杀死另一个代替。

export const rangerAbility = createRoleAbility({
  roleId: "ranger",
  abilityId: "ranger_special_ability",
  abilityName: "守护互换",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.ranger.wake",
  targetConfig: {
    min: 2,
    max: 2,
    allowSelf: true,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 游侠的能力逻辑：选择两名玩家，恶魔击杀时互换目标
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 游侠的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("游侠能力被调用");
      return context;
    },
  ],
});
