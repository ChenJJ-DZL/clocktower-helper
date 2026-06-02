/**
 * 城镇公告员（town_crier）新引擎技能实现
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
  // 记录今日是否有爪牙提名
const todayMinionNominated = snapshot.minionNominatedToday ?? false;
return { ...context, meta: { ...context.meta, abilityResult: { minionNominated: todayMinionNominated }, isCorrupted: false } };
};

// 后置处理
const postProcess = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult;
const log = '[TownCrier] ' + (result?.minionNominated ? '白天有爪牙发起过提名' : '白天没有爪牙发起提名');
console.log(log);
  return {
    ...context,
    meta: { ...context.meta, abilityLog: "城镇公告员已完成夜间行动" },
  };
};

export const town_crierAbility = createRoleAbility({
  roleId: "town_crier",
  abilityId: "town_crier_ability",
  abilityName: "提名侦测",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 41,
  firstNightOnly: false,
  wakePromptId: "role.town_crier.wake",
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
