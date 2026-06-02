/**
 * astronomer（astronomer）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheckAlive = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);
  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }
  return { ...context, meta: { ...context.meta, isAlive: true } };
};

const calculate = async (context: MiddlewareContext): Promise<MiddlewareContext> => {
  return { ...context, meta: { ...context.meta, abilityResult: { roleId: "astronomer" } } };
};

const postProcess = async (context: MiddlewareContext): Promise<MiddlewareContext> => {
  return { ...context, meta: { ...context.meta, abilityLog: "astronomer已完成行动" } };
};

export const astronomerAbility = createRoleAbility({
  roleId: "astronomer",
  abilityId: "astronomer_ability",
  abilityName: "astronomer能力",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 999,
  firstNightOnly: false,
  wakePromptId: "role.astronomer.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAlive],
  calculate: [calculate],
  stateUpdate: [],
  postProcess: [postProcess],
});
