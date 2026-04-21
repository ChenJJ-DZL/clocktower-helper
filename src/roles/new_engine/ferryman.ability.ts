/**
 * 摆渡人（Ferryman）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 摆渡人是特殊能力角色
// 如果你死了，好人阵营输。

export const ferrymanAbility = createRoleAbility({
  roleId: "ferryman",
  abilityId: "ferryman_special_ability",
  abilityName: "死亡导致失败",
  triggerTiming: [AbilityTriggerTiming.PASSIVE], // 被动能力
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.ferryman.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 摆渡人的能力逻辑：死亡导致好人阵营失败
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 摆渡人的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("摆渡人能力（被动）被调用");
      return context;
    },
  ],
});
