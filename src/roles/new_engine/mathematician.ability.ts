/**
 * 数学家（Mathematician）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 数学家是镇民角色
// 每个夜晚，你会得知有多少玩家的能力因为醉酒、中毒或其他原因而产生了异常结果。

export const mathematicianAbility = createRoleAbility({
  roleId: "mathematician",
  abilityId: "mathematician_special_ability",
  abilityName: "异常统计",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.mathematician.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 数学家的能力逻辑：统计异常能力结果数量
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 数学家的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("数学家能力被调用");
      return context;
    },
  ],
});
