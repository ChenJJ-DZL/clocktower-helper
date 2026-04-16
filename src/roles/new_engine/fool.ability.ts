/**
 * 弄臣（Fool）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 弄臣是被动能力，没有夜晚行动
// 他的能力在死亡时触发，由GameController中的死亡逻辑处理

export const foolAbility = createRoleAbility({
  roleId: "fool",
  abilityId: "fool_passive_ability",
  abilityName: "免死一次",
  triggerTiming: [AbilityTriggerTiming.PASSIVE], // 被动能力
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.fool.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 弄臣没有主动能力，所以这里只是占位
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 弄臣没有主动能力，所以这里只是占位
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("弄臣能力（被动）被调用");
      return context;
    },
  ],
});
