/**
 * 和平主义者（Pacifist）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：和平主义者的能力在处决时触发
const preCheckOnExecution = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  return { ...context, meta: { ...context.meta, isExecutionTrigger: true } };
};

// 计算结果：检查被处决的是否是善良玩家，并决定是否让其存活
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, storytellerInput } = context;

  // 获取和平主义者座位
  const pacifistSeatId = context.actionNode.seatId;

  // 获取被处决的玩家
  const executedSeatId = storytellerInput?.executedSeatId;
  const executedSeat = snapshot.seats.find((s) => s.id === executedSeatId);

  if (!executedSeat) {
    return { ...context, aborted: true, abortReason: "未找到被处决的座位" };
  }

  // 检查被处决的是否是善良玩家
  const isGoodExecuted = executedSeat.alignment === "good";

  // 说书人决定是否让善良玩家存活
  const shouldSave = storytellerInput?.shouldSave ?? false;

  const result = {
    pacifistSeatId,
    executedSeatId,
    executedRole: executedSeat.roleId,
    isGoodExecuted,
    shouldSave: isGoodExecuted && shouldSave,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

// 状态更新：如果应该拯救，则取消死亡
const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult;

  if (!result?.shouldSave) {
    return context;
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      stateUpdates: {
        type: "CANCEL_DEATH",
        targetId: result.executedSeatId,
        reason: "和平主义者的能力触发",
      },
    },
  };
};

export const pacifistAbility = createRoleAbility({
  roleId: "pacifist",
  abilityId: "pacifist_execution_ability",
  abilityName: "和平守护",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 999,
  firstNightOnly: false,
  wakePromptId: "role.pacifist.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckOnExecution],
  calculate: [calculateResult],
  stateUpdate: [stateUpdate],
  postProcess: [
    async (context) => {
      const { meta } = context;
      const result = meta.abilityResult;
      if (result.shouldSave) {
        console.log(
          `和平主义者（${result.pacifistSeatId + 1}号）的能力触发！善良玩家${
            result.executedSeatId + 1
          }号被处决但存活！`
        );
      }
      return context;
    },
  ],
});
