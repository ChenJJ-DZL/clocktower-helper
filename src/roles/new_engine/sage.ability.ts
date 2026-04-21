/**
 * 贤者（Sage）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 贤者是镇民角色
// 当你被恶魔杀害时，你会得知两个玩家，其中一个是恶魔。

export const sageAbility = createRoleAbility({
  roleId: "sage",
  abilityId: "sage_special_ability",
  abilityName: "临终启示",
  triggerTiming: [AbilityTriggerTiming.ON_DEATH],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.sage.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 贤者的能力逻辑：被恶魔杀死时获得两个包含恶魔的候选
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 贤者的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("贤者能力被调用");
      return context;
    },
  ],
});
