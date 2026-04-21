/**
 * 末日预言者（Doomsayer）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 末日预言者是公开触发能力角色
// 如果大于等于四名玩家存活，每名当前存活的玩家可以公开要求你杀死一名与他阵营相同的玩家（每名玩家限一次）

export const doomsayerAbility = createRoleAbility({
  roleId: "doomsayer",
  abilityId: "doomsayer_public_ability",
  abilityName: "公开触发死亡",
  triggerTiming: [AbilityTriggerTiming.PASSIVE], // 被动能力，公开触发
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.doomsayer.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 末日预言者的能力逻辑：公开要求杀死同阵营玩家
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 末日预言者的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("末日预言者能力（被动）被调用");
      return context;
    },
  ],
});
