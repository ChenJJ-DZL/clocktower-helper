/**
 * 普卡（Pukka）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import type { GameStateSnapshot } from "../../utils/nightStateMachine";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否存活
const preCheckAlive = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat?.isAlive) {
    return {
      ...context,
      aborted: true,
      abortReason: "普卡已死亡，技能失效",
    };
  }

  return context;
};

// 计算阶段：验证目标合法性
const calculatePoisonTargets = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds, actionNode } = context;

  if (!targetIds || targetIds.length === 0) {
    return {
      ...context,
      aborted: true,
      abortReason: "普卡必须选择一名玩家",
    };
  }

  const targetId = targetIds[0];
  const targetSeat = snapshot.seats.find((s) => s.id === targetId);

  if (!targetSeat) {
    return {
      ...context,
      aborted: true,
      abortReason: "目标玩家不存在",
    };
  }

  if (!targetSeat.isAlive) {
    return {
      ...context,
      aborted: true,
      abortReason: "不能选择已死亡的玩家",
    };
  }

  // 检查保护机制
  const isProtected =
    targetSeat.statusEffects?.some((e: any) => e.type === "protected") ||
    (targetSeat as any).protectedByInnkeeper === true;

  return {
    ...context,
    meta: { ...context.meta, targetId, isProtected },
  };
};

// 状态更新：使目标中毒
const updatePoisonState = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const { targetId, isProtected } = meta as {
    targetId: number;
    isProtected: boolean;
  };

  if (isProtected) {
    return context; // 目标被保护，不中毒
  }

  // 生成新的状态快照（不可变）
  const newSnapshot: GameStateSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat) => {
      if (seat.id === targetId) {
        return {
          ...seat,
          isPoisoned: true,
          statusDetails: [
            ...(seat.statusDetails || []),
            {
              type: "poison",
              source: "pukka",
              timestamp: Date.now(),
            },
          ],
        };
      }
      return seat;
    }),
  };

  return { ...context, snapshot: newSnapshot };
};

export const pukkaAbility = createRoleAbility({
  roleId: "pukka",
  abilityId: "pukka_poison",
  abilityName: "普卡毒杀",
  triggerTiming: [
    AbilityTriggerTiming.FIRST_NIGHT,
    AbilityTriggerTiming.EVERY_NIGHT,
  ],
  wakePriority: 109,
  targetConfig: { min: 1, max: 1, allowSelf: true, allowDead: false },
  preCheck: [preCheckAlive],
  calculate: [calculatePoisonTargets],
  stateUpdate: [updatePoisonState],
  postProcess: [],
});
