/**
 * 茶艺师（Tea Lady）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 预检查：这是一个被动能力，不需要主动执行
const preCheckPassive = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 茶艺师是被动能力，不需要主动唤醒
  return { ...context, aborted: true, abortReason: "茶艺师是被动能力" };
};

// 计算结果：茶艺师的能力是被动的，不需要主动计算
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  return context;
};

export const teaLadyAbility = createRoleAbility({
  roleId: "tea_lady",
  abilityId: "tea_lady_passive_protection",
  abilityName: "邻近善良保护",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],

  preCheck: [preCheckPassive],
  calculate: [calculateResult],
  stateUpdate: [],
  postProcess: [],
});
