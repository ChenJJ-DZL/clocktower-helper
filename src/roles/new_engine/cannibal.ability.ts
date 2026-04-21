/**
 * 食人族（Cannibal）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 食人族是镇民角色
// 每个夜晚，你会得知今天被处决的玩家的角色。如果你处决了镇民，你会获得他的能力，直到下一次处决。

export const cannibalAbility = createRoleAbility({
  roleId: "cannibal",
  abilityId: "cannibal_special_ability",
  abilityName: "吞噬能力",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.cannibal.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 食人族的能力逻辑：获取被处决玩家角色，吞噬镇民能力
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 食人族的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("食人族能力被调用");
      return context;
    },
  ],
});
