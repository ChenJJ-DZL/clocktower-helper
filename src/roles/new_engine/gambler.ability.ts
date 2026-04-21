/**
 * 赌徒（Gambler）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：赌徒在夜晚行动
const preCheckNightly = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  return { ...context, meta: { ...context.meta, isNightly: true } };
};

// 计算结果：猜测角色并判断是否错误
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, targetIds, storytellerInput } = context;

  // 获取赌徒座位
  const gamblerSeatId = context.actionNode.seatId;

  // 获取目标座位和猜测的角色
  const targetId = targetIds[0];
  const guessedRole = storytellerInput?.guessedRole;
  const targetSeat = snapshot.seats.find((s) => s.id === targetId);

  if (!targetSeat) {
    return { ...context, aborted: true, abortReason: "未找到目标座位" };
  }

  // 检查猜测是否正确
  const isGuessCorrect = targetSeat.roleId === guessedRole;

  const result = {
    gamblerSeatId,
    targetId,
    guessedRole,
    actualRole: targetSeat.roleId,
    isGuessCorrect,
    shouldDie: !isGuessCorrect,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

// 状态更新：如果猜错了，则标记为死亡
const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult;

  if (!result?.shouldDie) {
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
        targetId: result.gamblerSeatId,
        reason: "赌徒猜错角色",
      },
    },
  };
};

export const gamblerAbility = createRoleAbility({
  roleId: "gambler",
  abilityId: "gambler_guess_ability",
  abilityName: "豪赌",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 21,
  firstNightOnly: false,
  wakePromptId: "role.gambler.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: true,
    allowDead: true,
  },
  preCheck: [preCheckNightly],
  calculate: [calculateResult],
  stateUpdate: [stateUpdate],
  postProcess: [
    async (context) => {
      const { meta } = context;
      const result = meta.abilityResult;
      if (result.shouldDie) {
        console.log(
          `赌徒（${result.gamblerSeatId + 1}号）猜测${
            result.targetId + 1
          }号是${result.guessedRole}，但实际是${result.actualRole}，赌徒死亡！`
        );
      } else {
        console.log(
          `赌徒（${result.gamblerSeatId + 1}号）猜测${
            result.targetId + 1
          }号是${result.guessedRole}，猜对了！`
        );
      }
      return context;
    },
  ],
});
