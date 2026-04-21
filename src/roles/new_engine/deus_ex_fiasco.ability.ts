/**
 * 失败的上帝（Deus Ex Fiasco）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 失败的上帝是特殊能力角色
// 每局游戏至少一次，说书人将会出现失误，但会纠正并公开承认自己曾处理有误。

export const deusExFiascoAbility = createRoleAbility({
  roleId: "deus_ex_fiasco",
  abilityId: "deus_ex_fiasco_special_ability",
  abilityName: "说书人失误",
  triggerTiming: [AbilityTriggerTiming.PASSIVE], // 被动能力
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.deus_ex_fiasco.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 失败的上帝的能力逻辑：说书人出现失误但会纠正
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 失败的上帝的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("失败的上帝能力（被动）被调用");
      return context;
    },
  ],
});
