/**
 * 市长（Mayor）新引擎技能实现
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
    return { ...context, aborted: true };
  }

  const isDrunk = seat.statusEffects.some((e: any) => e.type === "drunk");
  const isPoisoned = seat.statusEffects.some((e: any) => e.type === "poisoned");
  const alivePlayersCount = snapshot.seats.filter((s) => s.isAlive).length;

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      isAbilityActive: !(isDrunk || isPoisoned),
      alivePlayersCount,
    },
  };
};

// 检查是否触发胜利条件
const checkVictoryCondition = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const alivePlayersCount = meta.alivePlayersCount ?? 0;

  if (!isAbilityActive || alivePlayersCount > 3) {
    return context;
  }

  // 存活玩家少于等于3人时，善良阵营获胜
  const newSnapshot = {
    ...snapshot,
    gamePhase: "gameOver",
    gameResult: {
      winner: "good",
      reason: "白天仅剩3名或更少玩家存活且市长存活，善良阵营获胜",
    },
  };

  return { ...context, snapshot: newSnapshot as any };
};

// 夜晚死亡保护：50%概率由其他玩家代替死亡
const handleNightDeathProtection = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const isNightKill = context.meta.isNightKill ?? false;

  if (!isAbilityActive || !isNightKill) {
    return context;
  }

  // 50%概率触发保护
  if (Math.random() >= 0.5) {
    const alivePlayers = snapshot.seats.filter(
      (s) => s.isAlive && s.id !== actionNode.seatId
    );
    if (alivePlayers.length === 0) {
      return context;
    }

    // 随机选择一名玩家代替市长死亡
    const randomVictim =
      alivePlayers[Math.floor(Math.random() * alivePlayers.length)];

    const newSnapshot = {
      ...snapshot,
      seats: snapshot.seats.map((seat) => {
        if (seat.id === actionNode.seatId) {
          // 市长存活
          return {
            ...seat,
            isAlive: true,
            deathReason: undefined,
            deathPhase: undefined,
          };
        }
        if (seat.id === randomVictim.id) {
          // 代替市长死亡
          return {
            ...seat,
            isAlive: false,
            deathReason: "代替市长死亡",
            deathPhase: "night",
          };
        }
        return seat;
      }),
    };

    return { ...context, snapshot: newSnapshot };
  }

  return context;
};

export const mayorAbility = createRoleAbility({
  roleId: "mayor",
  abilityId: "mayor_leadership",
  abilityName: "领导才能",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAliveAndStatus],
  calculate: [],
  stateUpdate: [checkVictoryCondition, handleNightDeathProtection],
  postProcess: [
    async (context) => {
      if (context.snapshot.gamePhase === "gameOver") {
        console.log("白天仅剩3名或更少玩家，市长触发胜利条件，善良阵营获胜！");
      }
      return context;
    },
  ],
});
