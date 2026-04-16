/**
 * 珀（Po）新引擎技能实现
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
      abortReason: "珀已死亡或不是恶魔，技能失效",
    };
  }

  return context;
};

// 计算阶段：验证目标合法性
const calculateKillTargets = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds } = context;

  if (targetIds.length > 3) {
    return {
      ...context,
      aborted: true,
      abortReason: "珀最多只能选择3个目标",
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

        return { ...seat, isAlive: false, killedBy: "po" };
      }
      return seat;
    }),
  };

  return { ...context, snapshot: newSnapshot };
};

export const poAbility = createRoleAbility({
  roleId: "po",
  abilityId: "po_night_kill",
  abilityName: "恶魔击杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 101, // 恶魔最后行动，珀在小恶魔之后
  firstNightOnly: false,
  wakePromptId: "po_wake",
  targetConfig: {
    min: 0,
    max: 3,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAlive],
  calculate: [calculateKillTargets],
  stateUpdate: [updateKillState],
  postProcess: [],
});
