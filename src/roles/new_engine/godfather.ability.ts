/**
 * 教父（Godfather）新引擎技能实现
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

export const godfatherAbility = createRoleAbility({
  roleId: "godfather",
  abilityId: "godfather_decoy",
  abilityName: "替身选择",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 50,
  firstNightOnly: true,
  wakePromptId: "role.godfather.wake",
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
      console.log("教父选择了替身");
      return context;
    },
  ],
});
