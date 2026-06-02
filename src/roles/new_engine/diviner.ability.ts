/**
 * diviner（diviner）新引擎技能实现
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
  return { ...context, meta: { ...context.meta, abilityResult: { roleId: "diviner" } } };
};

const postProcess = async (context: MiddlewareContext): Promise<MiddlewareContext> => {
  return { ...context, meta: { ...context.meta, abilityLog: "diviner已完成行动" } };
};

export const divinerAbility = createRoleAbility({
  roleId: "diviner",
  abilityId: "diviner_ability",
  abilityName: "diviner能力",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 999,
  firstNightOnly: false,
  wakePromptId: "role.diviner.wake",
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
