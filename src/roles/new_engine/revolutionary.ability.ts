/**
 * 革命者（Revolutionary）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 革命者是特殊能力角色
// 公开声明一对邻座玩家本局游戏一直保持同一阵营。每局游戏限一次，他们中的一人可能被当作其他的角色/阵营。

export const revolutionaryAbility = createRoleAbility({
  roleId: "revolutionary",
  abilityId: "revolutionary_special_ability",
  abilityName: "邻座同阵营",
  triggerTiming: [AbilityTriggerTiming.PASSIVE], // 被动能力
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.revolutionary.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 革命者的能力逻辑：确保邻座玩家同阵营
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 革命者的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("革命者能力（被动）被调用");
      return context;
    },
  ],
});
