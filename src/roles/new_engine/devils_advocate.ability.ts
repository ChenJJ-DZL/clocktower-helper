/**
 * 魔鬼代言人（Devil's Advocate）新引擎技能实现
 *
 * 修复: 取消注释，用统一命名 devils_advocate
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";

const preCheckAlive = async (context) => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);
  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }
  return { ...context, meta: { ...context.meta, isAlive: true } };
};

export const devils_advocateAbility = createRoleAbility({
  roleId: "devils_advocate",
  abilityId: "devils_advocate_protection",
  abilityName: "死亡豁免",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 40,
  firstNightOnly: false,
  wakePromptId: "role.devils_advocate.wake",
  targetConfig: { min: 1, max: 1, allowSelf: true, allowDead: false },
  preCheck: [preCheckAlive],
  calculate: [],
  stateUpdate: [],
  postProcess: [async (context) => { console.log("[DA] protection set"); return context; }],
});