/**
 * 气球驾驶员（Balloonist）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否存活、是否醉酒/中毒
const preCheckAliveAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }

  const isDrunk = seat.statusEffects.some((e: any) => e.type === "drunk");
  const isPoisoned = seat.statusEffects.some((e: any) => e.type === "poisoned");

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      isAbilityActive: !(isDrunk || isPoisoned),
    },
  };
};

// 计算结果：选择与上次角色类型不同的玩家
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;

  // 获取上次得知的玩家角色类型（从游戏记录中获取）
  const lastKnownRoleType = meta.balloonistLastKnownType ?? null;

  // 筛选符合条件的玩家
  let eligibleSeats = snapshot.seats.filter((seat) => {
    if (!isAbilityActive) {
      // 醉酒/中毒时，可以选择任何玩家（包括与上次同类型）
      return seat.isAlive || true; // 可以选择存活或死亡的玩家
    }

    // 正常情况：必须选择与上次角色类型不同的玩家
    if (lastKnownRoleType === null) {
      // 首夜：可以选择任何玩家
      return true;
    }
    return seat.roleType !== lastKnownRoleType;
  });

  // 如果没有符合条件的玩家，放宽限制
  if (eligibleSeats.length === 0) {
    eligibleSeats = snapshot.seats;
  }

  // 由说书人选择或随机选择一个玩家
  const selectedSeat =
    context.storytellerInput?.selectedSeatId ??
    eligibleSeats[Math.floor(Math.random() * eligibleSeats.length)];

  const result = {
    selectedSeatId: selectedSeat.id,
    roleType: selectedSeat.roleType,
    isDifferentFromLast: lastKnownRoleType
      ? selectedSeat.roleType !== lastKnownRoleType
      : true,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

export const balloonistAbility = createRoleAbility({
  roleId: "balloonist",
  abilityId: "balloonist_night_ability",
  abilityName: "类型追踪",
  triggerTiming: [
    AbilityTriggerTiming.FIRST_NIGHT,
    AbilityTriggerTiming.EVERY_NIGHT,
  ],
  wakePriority: 8,
  firstNightOnly: false,
  wakePromptId: "role.balloonist.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: true,
  },
  preCheck: [preCheckAliveAndStatus],
  calculate: [calculateResult],
  stateUpdate: [],
  postProcess: [
    async (context) => {
      const { meta } = context;
      const result = meta.abilityResult;
      console.log(
        `气球驾驶员得知了${result.selectedSeatId + 1}号玩家，角色类型：${result.roleType}`
      );
      return context;
    },
  ],
});
