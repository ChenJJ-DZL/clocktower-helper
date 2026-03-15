/**
 * 小恶魔（Imp）新引擎技能实现
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
      abortReason: "小恶魔已死亡或不是恶魔，技能失效",
    };
  }

  return context;
};

// 计算阶段：验证目标合法性
const calculateKillTarget = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds } = context;
  const targetSeat = snapshot.seats.find((s) => s.id === targetIds[0]);

  if (!targetSeat) {
    return { ...context, aborted: true, abortReason: "目标不存在" };
  }

  const isSuicide = targetSeat.id === context.actionNode.seatId;

  return {
    ...context,
    meta: { ...context.meta, targetSeat, isSuicide },
  };
};

// 状态更新：击杀目标，返回新的状态快照
const updateKillState = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds, meta } = context;
  const targetId = targetIds[0];

  // 生成新的状态快照（不可变）
  const newSnapshot: GameStateSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat) => {
      if (seat.id === targetId) {
        return { ...seat, isAlive: false, killedBy: "imp" };
      }
      return seat;
    }),
  };

  return { ...context, snapshot: newSnapshot };
};

// 后置处理：自杀传位逻辑
const postProcessSuicideTransfer = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const isSuicide = meta.isSuicide ?? false;

  if (!isSuicide) {
    return context;
  }

  // 找到所有活着的爪牙
  const aliveMinions = snapshot.seats.filter(
    (s) => s.isAlive && s.role.type === "minion"
  );

  if (aliveMinions.length === 0) {
    // 没有活着的爪牙，游戏直接结束，好人胜利
    return {
      ...context,
      meta: { ...context.meta, gameOver: true, winner: "good" },
    };
  }

  // 选择第一个爪牙成为新的小恶魔（说书人也可以通过storytellerInput指定）
  const newImpSeat = context.storytellerInput?.newImpId
    ? aliveMinions.find((s) => s.id === context.storytellerInput.newImpId)
    : aliveMinions[0];

  if (!newImpSeat) {
    return context;
  }

  // 生成传位后的新快照
  const newSnapshot: GameStateSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat) => {
      if (seat.id === newImpSeat.id) {
        // 爪牙变成小恶魔
        return {
          ...seat,
          role: {
            ...seat.role,
            id: "imp",
            name: "小恶魔",
            type: "demon",
          },
          statusEffects: seat.statusEffects.filter(
            (e: any) => e.type !== "poisoned" && e.type !== "drunk"
          ),
        };
      }
      if (seat.id === actionNode.seatId) {
        // 原小恶魔标记为自杀
        return { ...seat, isAlive: false, killedBy: "imp_suicide" };
      }
      return seat;
    }),
  };

  return {
    ...context,
    snapshot: newSnapshot,
    meta: { ...context.meta, newImpId: newImpSeat.id },
  };
};

export const impAbility = createRoleAbility({
  roleId: "imp",
  abilityId: "imp_night_kill",
  abilityName: "恶魔击杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 100, // 恶魔最后行动
  firstNightOnly: false,
  wakePromptId: "imp_wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: true, // 允许自杀传位
    allowDead: false,
  },
  preCheck: [preCheckAlive],
  calculate: [calculateKillTarget],
  stateUpdate: [updateKillState],
  postProcess: [postProcessSuicideTransfer],
});
