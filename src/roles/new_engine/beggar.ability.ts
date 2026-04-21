/**
 * 乞丐（Beggar）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 乞丐是旅行者角色
// 你不能投票。每个白天，你可以请求一名玩家给你投票权，如果他同意，你获得他的投票权直到他死亡。

export const beggarAbility = createRoleAbility({
  roleId: "beggar",
  abilityId: "beggar_special_ability",
  abilityName: "乞讨选票",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.beggar.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 乞丐的能力逻辑：请求玩家的投票权
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 乞丐的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("乞丐能力被调用");
      return context;
    },
  ],
});
