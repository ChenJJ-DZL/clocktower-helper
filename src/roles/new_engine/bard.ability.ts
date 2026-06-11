/**
 * 吟游诗人（Bard）新引擎技能实现
 *
 * 【角色能力】"当一名爪牙死于处决时，除了你和旅行者以外的所有其他玩家醉酒直到明天黄昏。"
 *
 * 被动触发：检测是否有爪牙被处决。
 * 如果爪牙被处决，标记 bardActivated，对所有非吟游诗人/非旅行者的存活玩家施加醉酒效果（直到明天黄昏）。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：由处决系统触发，仅在有爪牙被处决时继续
const preCheckOnMinionExecution = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  return { ...context, meta: { ...context.meta, isExecutionTrigger: true } };
};

// 计算：检测被处决的玩家是否为爪牙
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, storytellerInput } = context;
  const bardSeatId = context.actionNode.seatId;

  const executedSeatId = storytellerInput?.executedSeatId;
  const executedSeat = snapshot.seats.find((s: any) => s.id === executedSeatId);

  if (!executedSeat) {
    return { ...context, aborted: true, abortReason: "未找到被处决的座位" };
  }

  const isMinionExecuted = executedSeat.roleType === "minion";

  const result = {
    bardSeatId,
    executedSeatId,
    executedRole: executedSeat.roleId,
    isMinionExecuted,
    shouldActivate: isMinionExecuted,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

// 状态更新：如果爪牙被处决，标记所有其他玩家醉酒（直到明天黄昏）
const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, snapshot } = context;
  const result = meta.abilityResult as any;

  if (!result?.shouldActivate) {
    return context;
  }

  // 找出所有需要醉酒的玩家（除吟游诗人和旅行者外）
  const drunkTargetIds = snapshot.seats
    .filter(
      (seat: any) =>
        seat.id !== result.bardSeatId &&
        seat.roleType !== "traveler" &&
        seat.isAlive
    )
    .map((seat: any) => seat.id);

  return {
    ...context,
    snapshot: {
      ...snapshot,
      bardActivated: true,
      _abilityResults: {
        ...((snapshot as any)._abilityResults ?? {}),
        bard: result,
      },
    },
    meta: {
      ...context.meta,
      bardActivated: true,
      stateUpdates: {
        type: "MARK_ALL_FOR_DRUNK",
        targetIds: drunkTargetIds,
        reason: "吟游诗人的能力触发",
        duration: "until_tomorrow_dusk",
      },
    },
  };
};

const postProcess = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult as any;
  if (result?.shouldActivate) {
    const log =
      `[Bard] 吟游诗人（${result.bardSeatId + 1}号）能力触发！爪牙` +
      `${result.executedSeatId + 1}号被处决，所有其他非旅行者玩家醉酒直到明天黄昏`;
    console.log(log);
  }
  return context;
};

export const bardAbility = createRoleAbility({
  roleId: "bard",
  abilityId: "bard_execution_ability",
  abilityName: "醉人的乐章",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 999,
  firstNightOnly: false,
  wakePromptId: "role.bard.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheckOnMinionExecution],
  calculate: [calculateResult],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
