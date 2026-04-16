/**
 * 刺客（Assassin）新引擎技能实现
 */

import {
  canUseLimitedAbility,
  useLimitedAbility,
} from "../../utils/LimitedAbilityManager";
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否已使用能力
const preCheckLimitedAbility = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { actionNode } = context;
  const seatId = actionNode.seatId;

  if (!canUseLimitedAbility(seatId, "assassin_kill")) {
    return {
      ...context,
      aborted: true,
      abortReason: "刺客已经使用过暗杀能力了",
    };
  }

  return context;
};

// 前置校验：检查是否首夜（刺客首夜不行动）
const preCheckNotFirstNight = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot } = context;

  if (snapshot.isFirstNight) {
    return {
      ...context,
      aborted: true,
      abortReason: "刺客首夜不行动",
    };
  }

  return context;
};

// 状态更新：执行暗杀（无视任何保护）
const updateAssassinationStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds, meta, actionNode } = context;
  const isAbilityEffective = meta.abilityEffective ?? true;
  const targetId = targetIds?.[0];

  if (!targetId) {
    // 未选择目标，不消耗能力
    return context;
  }

  // 创建新的快照
  let newSnapshot = { ...snapshot };

  if (isAbilityEffective) {
    // 能力有效时，直接杀死目标（无视任何保护）
    newSnapshot = {
      ...snapshot,
      seats: snapshot.seats.map((seat) => {
        if (seat.id === targetId) {
          return {
            ...seat,
            isAlive: false,
            isDead: true,
            // 标记为刺客击杀，无视保护
            deathSource: "assassin_kill",
            deathSourceSeatId: actionNode.seatId,
            assassinated: true,
          };
        }
        return seat;
      }),
    };
  }

  // 无论成功与否，只要选择了目标就标记能力已使用
  useLimitedAbility(actionNode.seatId, "assassin_kill");

  return {
    ...context,
    snapshot: newSnapshot,
    meta: {
      ...context.meta,
      assassinationSuccess: isAbilityEffective,
    },
  };
};

export const assassinAbility = createRoleAbility({
  roleId: "assassin",
  abilityId: "assassin_night_ability",
  abilityName: "致命暗杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 12,
  firstNightOnly: false,
  wakePromptId: "role.assassin.wake",
  targetConfig: {
    min: 0, // 允许选择不使用能力（0个目标）
    max: 1,
    allowSelf: true,
    allowDead: false,
  },
  preCheck: [
    commonPreCheckAlive,
    preCheckNotFirstNight,
    preCheckLimitedAbility,
  ],
  calculate: [],
  stateUpdate: [updateAssassinationStatus],
  postProcess: [
    async (context) => {
      const { meta, targetIds, actionNode } = context;
      const targetId = targetIds?.[0];
      const assassinationSuccess = meta.assassinationSuccess;

      if (!targetId) {
        console.log(`🗡️ ${actionNode.seatId + 1}号(刺客) 选择不使用能力`);
      } else if (assassinationSuccess) {
        console.log(
          `🗡️ ${actionNode.seatId + 1}号(刺客) 成功暗杀了 ${targetId + 1}号玩家（无视任何保护）`
        );
      } else {
        console.log(
          `🗡️ ${actionNode.seatId + 1}号(刺客) 尝试暗杀 ${targetId + 1}号玩家，但因醉酒/中毒失败（能力已消耗）`
        );
      }
      return context;
    },
  ],
});
