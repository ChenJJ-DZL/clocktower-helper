/**
 * 赌徒（Gambler）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewareTypes";
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

  const targetRole = targetSeat.role?.id ?? targetSeat.roleId;
  const isGuessCorrect = targetRole === guessedRole;

  // 检查赌徒是否受到茶艺师或旅店老板等免死保护
  const gamblerSeat = snapshot.seats.find((s) => s.id === gamblerSeatId);
  const isProtected =
    (gamblerSeat?.statusEffects ?? []).some((e: any) => e.type === "protected") ||
    (gamblerSeat as any)?.isProtected === true ||
    (gamblerSeatId != null &&
      snapshot.seats.some((s) => s.role?.id === "tea_lady") &&
      // 动态判断茶艺师邻近存活双善良保护
      ((snapshot as any).teaLadyProtectedIds?.includes(gamblerSeatId) ||
        (gamblerSeat && (gamblerSeat as any).protectedByTeaLady)));

  const shouldDie = !isGuessCorrect && !isProtected;

  const result = {
    gamblerSeatId,
    targetId,
    guessedRole,
    actualRole: targetRole,
    isGuessCorrect,
    isProtected,
    shouldDie,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

// 状态更新：如果猜错了且未受保护，则标记为死亡
const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, snapshot } = context;
  const result = meta.abilityResult as any;

  if (!result?.shouldDie) {
    return context;
  }

  const seats = snapshot.seats.map((seat) => {
    if (seat.id === result.gamblerSeatId && !seat.isDead) {
      return {
        ...seat,
        isAlive: false,
        isDead: true,
        diedAtNight: snapshot.nightCount,
        deathSource: "gambler_guess_fail",
        killedBy: "gambler",
      };
    }
    return seat;
  });

  return {
    ...context,
    snapshot: {
      ...snapshot,
      seats,
      _abilityResults: {
        ...((snapshot as any)._abilityResults ?? {}),
        gambler: result,
      },
    },
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
  firstNightPriority: null,
  otherNightPriority: 21,
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
      const log = result.shouldDie
        ? `赌徒（${result.gamblerSeatId + 1}号）猜测${result.targetId + 1}号是【${result.guessedRole}】，但实际是【${result.actualRole}】，猜错死亡！`
        : `赌徒（${result.gamblerSeatId + 1}号）猜测${result.targetId + 1}号是【${result.guessedRole}】，猜对了！`;
      console.log(log);
      return {
        ...context,
        meta: {
          ...context.meta,
          abilityLog: log,
          displayInfo: {
            type: "gambler_info",
            targetId: result.targetId,
            guessedRole: result.guessedRole,
            isGuessCorrect: !result.shouldDie,
            log,
          },
        },
      };
    },
  ],
});
