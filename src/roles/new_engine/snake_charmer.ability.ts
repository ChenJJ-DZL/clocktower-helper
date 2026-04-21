/**
 * 舞蛇人（Snake Charmer）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 舞蛇人是镇民角色
// 每个夜晚，你可以选择一名玩家。如果你选择的是恶魔，你会与他交换阵营和角色，然后你会中毒。

export const snake_charmerAbility = createRoleAbility({
  roleId: "snake_charmer",
  abilityId: "snake_charmer_special_ability",
  abilityName: "蛇吻魅惑",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.snake_charmer.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 舞蛇人的能力逻辑：选择玩家，如果是恶魔则交换身份并中毒
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 舞蛇人的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("舞蛇人能力被调用");
      return context;
    },
  ],
});
