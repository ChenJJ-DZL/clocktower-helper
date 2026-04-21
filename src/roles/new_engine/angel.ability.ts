/**
 * 天使（Angel）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 天使是夜间能力角色
// 首个夜晚，选择一名玩家：他今晚不会死亡
// 如果他是好人，他会得知你

export const angelAbility = createRoleAbility({
  roleId: "angel",
  abilityId: "angel_night_ability",
  abilityName: "保护玩家",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 35,
  firstNightOnly: true,
  wakePromptId: "role.angel.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 天使的能力逻辑：保护玩家不死亡，并让好人得知自己
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 天使的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("天使能力被调用");
      return context;
    },
  ],
});
