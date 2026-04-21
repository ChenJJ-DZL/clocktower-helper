/**
 * 窃贼（Thief）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 窃贼是旅行者角色
// 每个夜晚，你可以选择一名玩家，偷取他的能力，直到下一个夜晚。

export const thiefAbility = createRoleAbility({
  roleId: "thief",
  abilityId: "thief_special_ability",
  abilityName: "妙手空空",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.thief.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 窃贼的能力逻辑：偷取目标玩家的能力
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 窃贼的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("窃贼能力被调用");
      return context;
    },
  ],
});
