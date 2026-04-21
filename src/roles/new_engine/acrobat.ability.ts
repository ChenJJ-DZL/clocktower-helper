/**
 * 杂技演员（Acrobat）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 杂技演员是夜晚能力角色
// 每个夜晚*，选择一名玩家：如果当晚他醉酒或中毒，你死亡

export const acrobatAbility = createRoleAbility({
  roleId: "acrobat",
  abilityId: "acrobat_night_ability",
  abilityName: "检测醉酒中毒",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT], // 除首夜外的夜晚
  wakePriority: 22,
  firstNightOnly: false,
  wakePromptId: "role.acrobat.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: true,
    allowDead: true,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 杂技演员的能力逻辑：检测目标是否醉酒或中毒
      // 这部分逻辑需要在GameController中实现
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 杂技演员的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("杂技演员能力被调用");
      return context;
    },
  ],
});
