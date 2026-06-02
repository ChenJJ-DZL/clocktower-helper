/**
 * 诺-达鲺（no_dashii）新引擎技能实现
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
  return { ...context, meta: { ...context.meta, abilityResult: { targetId: context.targetIds[0], killed: true } } };
};

// 后置处理
const postProcess = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const r = meta.abilityResult;
console.log('[NoDashii] 诺-达鲺击杀:', r?.targetId != null ? '玩家' + (r.targetId + 1) : '无');
  return {
    ...context,
    meta: { ...context.meta, abilityLog: "诺-达鲺已完成夜间行动" },
  };
};

export const no_dashiiAbility = createRoleAbility({
  roleId: "no_dashii",
  abilityId: "no_dashii_ability",
  abilityName: "毒素杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 51,
  firstNightOnly: false,
  wakePromptId: "role.no_dashii.wake",
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
