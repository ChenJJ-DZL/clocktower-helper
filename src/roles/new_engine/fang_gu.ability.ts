/**
 * 方古（Fang Gu）新引擎技能实现
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

export const fang_guAbility = createRoleAbility({
  roleId: "fang_gu",
  abilityId: "fang_gu_kill",
  abilityName: "外来者猎杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 100,
  firstNightOnly: false,
  wakePromptId: "role.fang_gu.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAlive],
  calculate: [],
  stateUpdate: [],
  postProcess: [
    async (context) => {
      console.log("方古选择了杀戮目标");
      return context;
    },
  ],
});
