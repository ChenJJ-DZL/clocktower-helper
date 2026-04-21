/**
 * 佛教徒（Buddhist）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 佛教徒是特殊能力角色
// 每个白天的前两分钟老玩家不能发言。

export const buddhistAbility = createRoleAbility({
  roleId: "buddhist",
  abilityId: "buddhist_special_ability",
  abilityName: "白天发言限制",
  triggerTiming: [AbilityTriggerTiming.PASSIVE], // 被动能力
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.buddhist.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 佛教徒的能力逻辑：限制白天前两分钟老玩家发言
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 佛教徒的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("佛教徒能力（被动）被调用");
      return context;
    },
  ],
});
