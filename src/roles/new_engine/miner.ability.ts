/**
 * 矿工（Miner）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 矿工是镇民角色
// 首夜，你会得知3个不在场角色。如果有任何爪牙在你旁边，你会得知其中一个。

export const minerAbility = createRoleAbility({
  roleId: "miner",
  abilityId: "miner_special_ability",
  abilityName: "地质勘探",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 0,
  firstNightOnly: true,
  wakePromptId: "role.miner.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 矿工的能力逻辑：获取3个不在场角色和邻座爪牙信息
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 矿工的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("矿工能力被调用");
      return context;
    },
  ],
});
