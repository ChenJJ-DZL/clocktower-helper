/**
 * 玩具匠（Toymaker）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 玩具匠是特殊能力角色
// 恶魔可以在夜晚选择放弃攻击（每局游戏至少一次）。邪恶玩家照常获取初始信息。

export const toymakerAbility = createRoleAbility({
  roleId: "toymaker",
  abilityId: "toymaker_special_ability",
  abilityName: "恶魔放弃攻击",
  triggerTiming: [AbilityTriggerTiming.PASSIVE], // 被动能力
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.toymaker.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 玩具匠的能力逻辑：让恶魔可以放弃攻击
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 玩具匠的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("玩具匠能力（被动）被调用");
      return context;
    },
  ],
});
