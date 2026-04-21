/**
 * 暴风捕手（Stormcatcher）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 暴风捕手是特殊能力角色
// 你会选择一个角色。如果那个角色在场上，说书人会大声宣布一个类似的角色。你会知道这与你的选择有关。

export const stormcatcherAbility = createRoleAbility({
  roleId: "stormcatcher",
  abilityId: "stormcatcher_special_ability",
  abilityName: "角色宣告",
  triggerTiming: [AbilityTriggerTiming.PASSIVE], // 被动能力
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.stormcatcher.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 暴风捕手的能力逻辑：选择一个角色，如果在场上会有宣告
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 暴风捕手的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("暴风捕手能力（被动）被调用");
      return context;
    },
  ],
});
