/**
 * 间谍 (Spy) - 黯月初升剧本
 *
 * 角色能力：
 * - 每个夜晚，你能查看魔典
 * - 你可能会被当作善良阵营、镇民角色或外来者角色，即使你已死亡
 *
 * 夜晚行动：
 * - 首夜和后续夜晚都行动
 * - 唤醒间谍查看魔典
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否存活
const preCheckAliveAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "间谍已死亡" };
  }

  return context;
};

// 计算结果：间谍只需要查看魔典
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 间谍不需要计算结果，只需要查看魔典
  return context;
};

export const spyAbility = createRoleAbility({
  roleId: "spy",
  abilityId: "spy_night_ability",
  abilityName: "查看魔典",
  triggerTiming: [
    AbilityTriggerTiming.FIRST_NIGHT,
    AbilityTriggerTiming.EVERY_NIGHT,
  ],
  wakePriority: 45,
  firstNightOnly: false,
  wakePromptId: "role.spy.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAliveAndStatus],
  calculate: [calculateResult],
  stateUpdate: [],
  postProcess: [
    async (context) => {
      const { actionNode } = context;
      console.log(`间谍（${actionNode.seatId + 1}号）已查看魔典`);
      return context;
    },
  ],
});
