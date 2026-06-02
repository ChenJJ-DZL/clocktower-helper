/**
 * 洗脑师（cerenovus）新引擎技能实现
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
  const targetId = context.targetIds[0];
return { ...context, meta: { ...context.meta, abilityResult: { targetId, roleName: context.storytellerInput?.roleName || '未知' } } };
};

// 后置处理
const postProcess = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const r = meta.abilityResult;
console.log('[Cerenovus] 洗脑目标:', r?.targetId != null ? '玩家' + (r.targetId + 1) : '无');
  return {
    ...context,
    meta: { ...context.meta, abilityLog: "洗脑师已完成夜间行动" },
  };
};

export const cerenovusAbility = createRoleAbility({
  roleId: "cerenovus",
  abilityId: "cerenovus_ability",
  abilityName: "疯狂洗脑",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT, AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 38,
  firstNightOnly: true,
  wakePromptId: "role.cerenovus.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAlive],
  calculate: [calculate],
  stateUpdate: [],
  postProcess: [postProcess],
});
