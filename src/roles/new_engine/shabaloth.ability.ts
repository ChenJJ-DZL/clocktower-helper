/**
 * 沙巴洛斯（Shabaloth）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import type { GameStateSnapshot } from "../../utils/nightStateMachine";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否存活，是否为恶魔
const preCheckAlive = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat?.isAlive || seat.role.type !== "demon") {
    return {
      ...context,
      aborted: true,
      abortReason: "沙巴洛斯已死亡或不是恶魔，技能失效",
    };
  }

  return context;
};

// 计算阶段：验证目标合法性
const calculateKillTargets = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds } = context;

  if (targetIds.length !== 2) {
    return {
      ...context,
      aborted: true,
      abortReason: "沙巴洛斯需要选择2名玩家",
    };
  }

  // 验证所有目标是否存在且存活
  const validTargets = targetIds.filter((targetId) => {
    const targetSeat = snapshot.seats.find((s) => s.id === targetId);
    return targetSeat?.isAlive;
  });

  return {
    ...context,
    meta: { ...context.meta, validTargets },
  };
};

// 状态更新：击杀目标，返回新的状态快照
const updateKillState = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const validTargets = meta.validTargets as number[];

  if (!validTargets || validTargets.length === 0) {
    return context;
  }

  // 生成新的状态快照（不可变）
  const newSnapshot: GameStateSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat) => {
      if (validTargets.includes(seat.id)) {
        const isProtected =
          seat.statusEffects?.some((e: any) => e.type === "protected") ||
          (seat as any).isProtected;

        if (isProtected) {
          return seat; // 目标被保护，不死亡
        }

        return { ...seat, isAlive: false, killedBy: "shabaloth" };
      }
      return seat;
    }),
  };

  return { ...context, snapshot: newSnapshot };
};

export const shabalothAbility = createRoleAbility({
  roleId: "shabaloth",
  abilityId: "shabaloth_night_kill",
  abilityName: "恶魔击杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 103, // 恶魔最后行动，沙巴洛斯在珀之后
  firstNightOnly: false,
  wakePromptId: "shabaloth_wake",
  targetConfig: {
    min: 2,
    max: 2,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAlive],
  calculate: [calculateKillTargets],
  stateUpdate: [updateKillState],
  postProcess: [],
});
