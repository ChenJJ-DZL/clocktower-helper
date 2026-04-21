/**
 * 魔鬼代言人（Devil's Advocate）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否存活
const preCheckAlive = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      isAlive: true,
    },
  };
};

export const devil_s_advocateAbility = createRoleAbility({
  roleId: "devil_s_advocate",
  abilityId: "devils_advocate_protection",
  abilityName: "死亡豁免",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 40,
  firstNightOnly: false,
  wakePromptId: "role.devil_s_advocate.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: true,
    allowDead: false,
  },
  preCheck: [preCheckAlive],
  calculate: [],
  stateUpdate: [],
  postProcess: [
    async (context) => {
      console.log("魔鬼代言人选择了明天处决会存活的玩家");
      return context;
    },
  ],
});
