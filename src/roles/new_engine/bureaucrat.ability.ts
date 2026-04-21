/**
 * 官员（Bureaucrat）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 官员是旅行者角色
// 每个夜晚，你要选择除你以外的一名玩家：明天白天，他的投票算作三票。

export const bureaucratAbility = createRoleAbility({
  roleId: "bureaucrat",
  abilityId: "bureaucrat_special_ability",
  abilityName: "三倍选票",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.bureaucrat.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 官员的能力逻辑：选择一个玩家，明天白天他的投票算作三票
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 官员的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("官员能力被调用");
      return context;
    },
  ],
});
