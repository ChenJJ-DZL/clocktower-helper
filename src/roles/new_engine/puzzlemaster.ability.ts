/**
 * 解谜大师（Puzzlemaster）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 解谜大师是混合能力角色
// 被动：一名玩家醉酒，即使你已死亡
// 主动：每局游戏限一次，可以猜测谁是那个醉酒的玩家

export const puzzlemasterAbility = createRoleAbility({
  roleId: "puzzlemaster",
  abilityId: "puzzlemaster_hybrid_ability",
  abilityName: "醉酒玩家与猜测",
  triggerTiming: [AbilityTriggerTiming.PASSIVE, AbilityTriggerTiming.DAY],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.puzzlemaster.wake",
  targetConfig: {
    min: 0,
    max: 1,
    allowSelf: true,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 解谜大师的能力逻辑
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 解谜大师的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("解谜大师能力被调用");
      return context;
    },
  ],
});
