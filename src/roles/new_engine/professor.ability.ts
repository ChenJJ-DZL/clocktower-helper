/**
 * 教授（Professor）新引擎技能实现
 */

import {
  canUseLimitedAbility,
  consumeLimitedAbility,
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

  if (!canUseLimitedAbility(seatId, "professor_resurrect")) {
    return {
      ...context,
      aborted: true,
      abortReason: "教授已经使用过复活能力了",
    };
  }

  return context;
};

// 前置校验：检查目标是否已死亡
const preCheckTargetDead = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds } = context;
  const targetId = targetIds?.[0];

  if (!targetId) {
    return {
      ...context,
      aborted: true,
      abortReason: "请选择一名死亡的玩家",
    };
  }

  const targetSeat = snapshot.seats.find((s) => s.id === targetId);
  if (!targetSeat || targetSeat.isAlive) {
    return {
      ...context,
      aborted: true,
      abortReason: "只能选择已死亡的玩家",
    };
  }

  return context;
};

// 状态更新：复活目标玩家（如果是镇民且能力有效）
const updateResurrectionStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds, meta, actionNode } = context;
  const isAbilityEffective = meta.abilityEffective ?? true;
  const targetId = targetIds?.[0];

  if (!targetId) {
    return context;
  }

  const targetSeat = snapshot.seats.find((s) => s.id === targetId);
  if (!targetSeat) {
    return context;
  }

  // 获取目标角色类型
  const actualRole =
    targetSeat.role?.id === "drunk" ? targetSeat.charadeRole : targetSeat.role;

  const isTownsfolk = actualRole?.type === "townsfolk";
  const shouldResurrect = isAbilityEffective && isTownsfolk;

  // 创建新的快照
  let newSnapshot = { ...snapshot };

  if (shouldResurrect) {
    // 复活目标玩家
    newSnapshot = {
      ...snapshot,
      seats: snapshot.seats.map((seat) => {
        if (seat.id === targetId) {
          return {
            ...seat,
            isAlive: true,
            isDead: false,
            isEvilConverted: false,
            // 可以在这里添加复活相关的状态标记
            statusEffects: [
              ...seat.statusEffects,
              {
                type: "resurrected",
                source: "professor",
                sourceSeatId: actionNode.seatId,
              },
            ],
          };
        }
        return seat;
      }),
    };
  }

  // 无论成功与否，都标记能力已使用
  consumeLimitedAbility(actionNode.seatId, "professor_resurrect");

  return {
    ...context,
    snapshot: newSnapshot,
    meta: {
      ...context.meta,
      resurrectionSuccess: shouldResurrect,
      targetIsTownsfolk: isTownsfolk,
    },
  };
};

export const professorAbility = createRoleAbility({
  roleId: "professor",
  abilityId: "professor_night_ability",
  abilityName: "起死回生",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 14,
  firstNightOnly: false,
  wakePromptId: "role.professor.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: true,
  },
  preCheck: [commonPreCheckAlive, preCheckLimitedAbility, preCheckTargetDead],
  calculate: [],
  stateUpdate: [updateResurrectionStatus],
  postProcess: [
    async (context) => {
      const { meta, targetIds, actionNode } = context;
      const targetId = targetIds?.[0];
      const resurrectionSuccess = meta.resurrectionSuccess;
      const targetIsTownsfolk = meta.targetIsTownsfolk;

      if (resurrectionSuccess && targetId) {
        console.log(
          `🎓 ${actionNode.seatId + 1}号(教授) 成功复活了 ${targetId + 1}号玩家`
        );
      } else if (targetId) {
        const reason = !targetIsTownsfolk ? "目标不是镇民" : "教授醉酒或中毒";
        console.log(
          `🎓 ${actionNode.seatId + 1}号(教授) 尝试复活 ${targetId + 1}号玩家，但失败了（${reason}）`
        );
      }
      return context;
    },
  ],
});
