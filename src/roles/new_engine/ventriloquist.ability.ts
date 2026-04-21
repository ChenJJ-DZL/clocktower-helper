/**
 * 腹语师（Ventriloquist）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 腹语师是特殊能力角色
// 每夜，你会选择一个玩家，说书人会通过你说话，使用你的声音。

export const ventriloquistAbility = createRoleAbility({
  roleId: "ventriloquist",
  abilityId: "ventriloquist_special_ability",
  abilityName: "声音传递",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.ventriloquist.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 腹语师的能力逻辑：选择一个玩家，通过他说话
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 腹语师的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("腹语师能力被调用");
      return context;
    },
  ],
});
