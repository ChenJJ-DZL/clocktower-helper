/**
 * 替罪羊（Scapegoat）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 替罪羊是旅行者角色
// 当你被处决时，你可以选择一名玩家代替你被处决，然后你存活。

export const scapegoatAbility = createRoleAbility({
  roleId: "scapegoat",
  abilityId: "scapegoat_special_ability",
  abilityName: "替死转嫁",
  triggerTiming: [AbilityTriggerTiming.ON_DEATH],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.scapegoat.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 替罪羊的能力逻辑：被处决时选择其他玩家代替死亡
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 替罪羊的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("替罪羊能力被调用");
      return context;
    },
  ],
});
