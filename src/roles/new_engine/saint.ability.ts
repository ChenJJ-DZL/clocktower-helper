/**
 * 圣徒（Saint）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否被处决
const preCheckIfExecuted = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat?.isAlive && seat?.executedToday) {
    const isDrunk = seat.statusEffects.some((e: any) => e.type === "drunk");
    const isPoisoned = seat.statusEffects.some(
      (e: any) => e.type === "poisoned"
    );

    return {
      ...context,
      meta: {
        ...context.meta,
        isAbilityActive: !(isDrunk || isPoisoned),
      },
    };
  }

  return { ...context, aborted: true };
};

// 状态更新：圣徒被处决则善良阵营失败
const handleSaintExecution = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;

  if (!isAbilityActive) {
    return context;
  }

  // 游戏结束，邪恶阵营获胜
  const newSnapshot = {
    ...snapshot,
    gamePhase: "gameOver",
    gameResult: {
      winner: "evil",
      reason: "圣徒被处决，邪恶阵营获胜",
    },
  };

  return { ...context, snapshot: newSnapshot as any };
};

export const saintAbility = createRoleAbility({
  roleId: "saint",
  abilityId: "saint_execution_curse",
  abilityName: "圣洁诅咒",
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
  preCheck: [preCheckIfExecuted],
  calculate: [],
  stateUpdate: [handleSaintExecution],
  postProcess: [
    async (context) => {
      if (context.snapshot.gamePhase === "gameOver") {
        console.log("圣徒被处决，邪恶阵营获胜！");
      }
      return context;
    },
  ],
});
