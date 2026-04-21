/**
 * 诡诈杰克（Trickster Jack）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 诡诈杰克是特殊能力角色
// 每夜，你会选择一个玩家，之后你会了解该玩家的真实身份。然后，如果他们是恶魔，邪恶阵营输掉。

export const tricksterJackAbility = createRoleAbility({
  roleId: "trickster_jack",
  abilityId: "trickster_jack_special_ability",
  abilityName: "身份揭露",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.trickster_jack.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 诡诈杰克的能力逻辑：选择一个玩家，了解其真实身份
      return context;
    },
  ],
  stateUpdate: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      // 诡诈杰克的状态更新逻辑
      return context;
    },
  ],
  postProcess: [
    async (context) => {
      console.log("诡诈杰克能力被调用");
      return context;
    },
  ],
});
