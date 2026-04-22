/**
 * 侍臣（Courtier）新引擎技能实现
 */

import {
  canUseLimitedAbility,
  consumeLimitedAbility,
} from "../../utils/LimitedAbilityManager";
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import type { GameStateSnapshot } from "../../utils/nightStateMachine";
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

  if (!canUseLimitedAbility(seatId, "courtier_drunk")) {
    return {
      ...context,
      aborted: true,
      abortReason: "侍臣已经使用过能力了",
    };
  }

  return context;
};

// 计算阶段：选择目标角色并找到对应的玩家
const calculateTargetRole = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, storytellerInput, meta } = context;
  const isAbilityEffective = meta.abilityEffective ?? true;

  // 从说书人输入中获取选择的角色ID
  const targetRoleId = storytellerInput?.targetRoleId;
  if (!targetRoleId) {
    return {
      ...context,
      aborted: true,
      abortReason: "请选择一个角色",
    };
  }

  // 找到所有拥有该角色的玩家
  const playersWithRole = snapshot.seats.filter(
    (seat) => seat.role?.id === targetRoleId && seat.isAlive
  );

  // 如果有多个该角色，说书人可以选择具体哪个，否则选择第一个
  let targetPlayerId: number | null = null;
  if (playersWithRole.length > 0) {
    if (storytellerInput?.targetPlayerId) {
      targetPlayerId =
        playersWithRole.find((s) => s.id === storytellerInput.targetPlayerId)
          ?.id ?? null;
    }
    if (!targetPlayerId) {
      targetPlayerId = playersWithRole[0].id;
    }
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      targetRoleId,
      targetPlayerId,
      rolePresent: playersWithRole.length > 0,
      isAbilityEffective,
    },
  };
};

// 状态更新：使目标角色醉酒3天3夜
const updateDrunkStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const targetPlayerId = meta.targetPlayerId;
  const isAbilityEffective = meta.abilityEffective ?? true;

  // 无论成功与否，都标记能力已使用
  consumeLimitedAbility(actionNode.seatId, "courtier_drunk");

  if (!isAbilityEffective || !targetPlayerId) {
    // 醉酒/中毒或者角色不在场，不产生效果
    return context;
  }

  // 生成新的状态快照
  const newSnapshot: GameStateSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat) => {
      if (seat.id === targetPlayerId) {
        return {
          ...seat,
          statusEffects: [
            ...seat.statusEffects,
            {
              type: "drunk",
              source: "courtier",
              sourceSeatId: actionNode.seatId,
              duration: 3, // 3天3夜
              remainingNights: 3,
              remainingDays: 3,
            },
          ],
        };
      }
      return seat;
    }),
  };

  return {
    ...context,
    snapshot: newSnapshot,
    meta: {
      ...context.meta,
      drunkApplied: true,
    },
  };
};

export const courtierAbility = createRoleAbility({
  roleId: "courtier",
  abilityId: "courtier_night_ability",
  abilityName: "朝臣醉酒",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 3, // 侍臣在夜晚较早行动
  firstNightOnly: false,
  wakePromptId: "role.courtier.wake",
  targetConfig: {
    min: 0, // 可以选择不使用能力
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive, preCheckLimitedAbility],
  calculate: [calculateTargetRole],
  stateUpdate: [updateDrunkStatus],
  postProcess: [
    async (context) => {
      const { meta, actionNode } = context;
      const targetRoleId = meta.targetRoleId;
      const targetPlayerId = meta.targetPlayerId;
      const rolePresent = meta.rolePresent;
      const isAbilityEffective = meta.isAbilityEffective;
      const drunkApplied = meta.drunkApplied;

      if (!targetRoleId) {
        console.log(`🍷 ${actionNode.seatId + 1}号(侍臣) 选择不使用能力`);
      } else if (!isAbilityEffective) {
        console.log(
          `🍷 ${actionNode.seatId + 1}号(侍臣) 在醉酒/中毒时选择了角色【${targetRoleId}】，无效果但能力已消耗`
        );
      } else if (!rolePresent) {
        console.log(
          `🍷 ${actionNode.seatId + 1}号(侍臣) 选择了不在场的角色【${targetRoleId}】，无效果但能力已消耗`
        );
      } else if (drunkApplied && targetPlayerId !== null) {
        console.log(
          `🍷 ${actionNode.seatId + 1}号(侍臣) 成功使 ${targetPlayerId + 1}号玩家(角色:${targetRoleId}) 醉酒3天3夜`
        );
      }

      return context;
    },
  ],
});
