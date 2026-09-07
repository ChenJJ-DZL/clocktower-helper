/**
 * 月之子（Moonchild）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

import { isDrunkOrPoisoned, isGoodSeat } from "../../utils/bmrMechanics";

// 前置校验：月之子能力在死亡时触发
const preCheckOnDeath = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 月之子的能力是在死亡时触发的
  return { ...context, meta: { ...context.meta, isDeathTrigger: true } };
};

// 计算结果：选择目标并判断是否杀死
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, targetIds } = context;

  // 获取月之子座位（已死亡）
  const moonchildSeatId = context.actionNode.seatId;
  const moonchildSeat = snapshot.seats.find((s) => s.id === moonchildSeatId);

  // 获取目标座位
  const targetId = targetIds[0];
  const targetSeat = snapshot.seats.find((s) => s.id === targetId);

  if (!targetSeat) {
    return { ...context, aborted: true, abortReason: "未找到目标座位" };
  }

  // 判断选择时月之子是否醉酒/中毒
  const isAbilityEffective =
    meta.abilityEffective ?? !isDrunkOrPoisoned(moonchildSeat);

  // 判断目标是否为善良阵营
  const targetIsGood = isGoodSeat(targetSeat);

  const shouldKill = targetIsGood && isAbilityEffective;

  const result = {
    moonchildSeatId,
    targetId,
    targetIsGood,
    isAbilityEffective,
    shouldKill,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

// 状态更新：如果目标是善良的，则标记为死亡
const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult;

  if (!result?.shouldKill) {
    return context;
  }

  // 状态更新逻辑会在GameController中实现
  // 这里只传递需要更新的信息
  return {
    ...context,
    meta: {
      ...context.meta,
      stateUpdates: {
        type: "MARK_FOR_DEATH",
        targetId: result.targetId,
        reason: "月之子诅咒",
      },
    },
  };
};

export const moonchildAbility = createRoleAbility({
  roleId: "moonchild",
  abilityId: "moonchild_death_ability",
  abilityName: "死亡诅咒",
  triggerTiming: [AbilityTriggerTiming.ON_DEATH],
  firstNightPriority: null,
  otherNightPriority: 75,
  firstNightOnly: false,
  wakePromptId: "role.moonchild.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckOnDeath],
  calculate: [calculateResult],
  stateUpdate: [stateUpdate],
  postProcess: [
    async (context) => {
      const { meta } = context;
      const result = meta.abilityResult;
      if (result.shouldKill) {
        console.log(
          `月之子选择了${result.targetId + 1}号，该玩家是善良阵营，将在当晚死亡`
        );
      } else {
        console.log(
          `月之子选择了${result.targetId + 1}号，该玩家是邪恶阵营，无事发生`
        );
      }
      return context;
    },
  ],
});
