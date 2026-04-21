/**
 * 吟游诗人（Minstrel）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：吟游诗人的能力在爪牙被处决时触发
const preCheckOnExecution = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  return { ...context, meta: { ...context.meta, isExecutionTrigger: true } };
};

// 计算结果：检查被处决的是否是爪牙
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, storytellerInput } = context;

  // 获取吟游诗人座位
  const minstrelSeatId = context.actionNode.seatId;

  // 获取被处决的玩家
  const executedSeatId = storytellerInput?.executedSeatId;
  const executedSeat = snapshot.seats.find((s) => s.id === executedSeatId);

  if (!executedSeat) {
    return { ...context, aborted: true, abortReason: "未找到被处决的座位" };
  }

  // 检查被处决的是否是爪牙
  const isMinionExecuted = executedSeat.roleType === "minion";

  const result = {
    minstrelSeatId,
    executedSeatId,
    executedRole: executedSeat.roleId,
    isMinionExecuted,
    shouldDrunkEveryone: isMinionExecuted,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

// 状态更新：如果爪牙被处决，则标记所有人（除吟游诗人和旅行者）醉酒
const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, snapshot } = context;
  const result = meta.abilityResult;

  if (!result?.shouldDrunkEveryone) {
    return context;
  }

  // 找出所有需要醉酒的玩家（除吟游诗人和旅行者外）
  const drunkTargetIds = snapshot.seats
    .filter(
      (seat) =>
        seat.id !== result.minstrelSeatId &&
        seat.roleType !== "traveler" &&
        seat.isAlive
    )
    .map((seat) => seat.id);

  return {
    ...context,
    meta: {
      ...context.meta,
      stateUpdates: {
        type: "MARK_ALL_FOR_DRUNK",
        targetIds: drunkTargetIds,
        reason: "吟游诗人的能力触发",
      },
    },
  };
};

export const minstrelAbility = createRoleAbility({
  roleId: "minstrel",
  abilityId: "minstrel_execution_ability",
  abilityName: "醉人的乐章",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 999,
  firstNightOnly: false,
  wakePromptId: "role.minstrel.wake",
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
      if (result.shouldDrunkEveryone) {
        console.log(
          `吟游诗人（${result.minstrelSeatId + 1}号）的能力触发！爪牙${
            result.executedSeatId + 1
          }号被处决，所有人（除吟游诗人和旅行者）醉酒到明天黄昏！`
        );
      }
      return context;
    },
  ],
});
