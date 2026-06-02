/**
 * 镜像双子（evil_twin）新引擎技能实现
 *
 * 角色能力：undefined
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
    meta: { ...context.meta, isAlive: true },
  };
};

// 计算中间件
const calculate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  // 首夜告知双子双方身份（由说书人手动处理）
return { ...context, meta: { ...context.meta, abilityResult: { twinRevealed: true } } };
};

// 后置处理
const postProcess = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  console.log('[EvilTwin] 双子首夜互知已完成');
  return {
    ...context,
    meta: { ...context.meta, abilityLog: "镜像双子已完成夜间行动" },
  };
};

export const evil_twinAbility = createRoleAbility({
  roleId: "evil_twin",
  abilityId: "evil_twin_ability",
  abilityName: "双子绑定",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 23,
  firstNightOnly: true,
  wakePromptId: "role.evil_twin.wake",
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
