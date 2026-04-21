/**
 * 疯子（Lunatic）新引擎技能实现
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

export const lunaticAbility = createRoleAbility({
  roleId: "lunatic",
  abilityId: "lunatic_fake_demon",
  abilityName: "恶魔幻想",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 100,
  firstNightOnly: false,
  wakePromptId: "role.lunatic.wake",
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
      console.log("疯子进行了虚假的恶魔杀戮选择");
      return context;
    },
  ],
});
