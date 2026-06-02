/**
 * 魔鬼代言人（devils_advocate）新引擎技能实现
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
  return { ...context, meta: { ...context.meta, abilityResult: { roleId: "devils_advocate" } } };
};

const postProcess = async (context: MiddlewareContext): Promise<MiddlewareContext> => {
  return { ...context, meta: { ...context.meta, abilityLog: "魔鬼代言人已完成行动" } };
};

export const devils_advocateAbility = createRoleAbility({
  roleId: "devils_advocate",
  abilityId: "devils_advocate_ability",
  abilityName: "魔鬼代言人能力",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT, AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 35,
  firstNightOnly: false,
  wakePromptId: "role.devils_advocate.wake",
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
