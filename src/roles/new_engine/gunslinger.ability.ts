/**
 * 枪手（Gunslinger）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 枪手是旅行者角色
// 每个白天，你可以选择一名玩家，直接杀死他，然后你会被处决。

export const gunslingerAbility = createRoleAbility({
  roleId: "gunslinger",
  abilityId: "gunslinger_special_ability",
  abilityName: "正义枪击",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.gunslinger.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 枪手的能力逻辑：选择并杀死玩家，随后自身被处决
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 枪手的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("枪手能力被调用");
      return context;
    },
  ],
});
