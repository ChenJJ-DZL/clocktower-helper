/**
 * 驱魔人 (Exorcist) - 黯月初升剧本
 *
 * 角色能力：
 * - 除首个夜晚以外的每个夜晚，你要选择一名玩家（与上个夜晚不同）
 * - 如果你选中了恶魔，他会得知你是驱魔人，但他当晚不会因其自身能力而被唤醒
 *
 * 触发时机：EVERY_NIGHT（除首夜外的每个夜晚）
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

// 计算结果：判断是否选中了恶魔
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode, targetIds } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const targets = targetIds || [];

  if (targets.length !== 1) {
    return {
      ...context,
      meta: {
        ...context.meta,
        abilityResult: {
          success: false,
          message: "请选择一名玩家",
          targetId: null,
          isTargetDemon: false,
        },
      },
    };
  }

  const targetId = targets[0];
  const targetSeat = snapshot.seats.find((s) => s.id === targetId);

  const isTargetDemon =
    targetSeat?.role?.type === "demon" || (targetSeat as any)?.isDemonSuccessor;

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: {
        success: true,
        targetId: targetId,
        isTargetDemon: isTargetDemon && isAbilityActive,
        targetName: targetSeat?.role?.name || "未知",
      },
    },
  };
};

export const exorcistAbility = createRoleAbility({
  roleId: "exorcist",
  abilityId: "exorcist_night_ability",
  abilityName: "恶魔驱逐",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 10,
  firstNightOnly: false,
  wakePromptId: "role.exorcist.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAliveAndStatus],
  calculate: [calculateResult],
  stateUpdate: [],
  postProcess: [
    async (context) => {
      const { meta, actionNode } = context;
      const result = meta.abilityResult;

      if (result?.success) {
        if (result.isTargetDemon) {
          console.log(
            `✨ ${actionNode.seatId + 1}号(驱魔人) 选中了恶魔(${result.targetId + 1}号)，恶魔今晚将不会被唤醒`
          );
        } else {
          console.log(
            `${actionNode.seatId + 1}号(驱魔人) 选择了 ${result.targetId + 1}号(${result.targetName})`
          );
        }
      }
      return context;
    },
  ],
});
