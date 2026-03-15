/**
 * 处女（Virgin）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否存活、是否已触发过技能
const preCheckAliveAndUnused = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }

  if (seat.abilityUsed) {
    return {
      ...context,
      aborted: true,
      abortReason: "处女技能已使用过，无法再次触发",
    };
  }

  const isDrunk = seat.statusEffects.some((e: any) => e.type === "drunk");
  const isPoisoned = seat.statusEffects.some((e: any) => e.type === "poisoned");
  const nominatorId = context.meta.nominatorId as string;
  const nominator = snapshot.seats.find((s) => s.id === nominatorId);

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      isAbilityActive: !(isDrunk || isPoisoned),
      nominator,
    },
  };
};

// 状态更新：处理处女技能触发
const updateExecutionStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const nominator = meta.nominator;

  if (!isAbilityActive || !nominator) {
    return context;
  }

  // 检查是否触发：提名者是镇民 或 隐士（50%概率触发）
  let shouldTrigger = nominator.role.type === "townsfolk";
  if (nominator.role.id === "recluse") {
    shouldTrigger = Math.random() < 0.5;
  }

  if (!shouldTrigger) {
    return context;
  }

  // 创建新快照：标记处女技能已使用，提名者直接被处决
  const newSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat) => {
      if (seat.id === actionNode.seatId) {
        return { ...seat, abilityUsed: true };
      }
      if (seat.id === nominator.id) {
        return {
          ...seat,
          isAlive: false,
          executedToday: true,
          deathReason: "处女技能触发",
          deathPhase: "nomination",
        };
      }
      return seat;
    }),
    votingPhase: {
      ...snapshot.votingPhase,
      isCancelled: true,
      cancelReason: "处女技能触发，今日提名阶段结束",
    },
  };

  return { ...context, snapshot: newSnapshot };
};

export const virginAbility = createRoleAbility({
  roleId: "virgin",
  abilityId: "virgin_nomination_ability",
  abilityName: "纯洁之身",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.virgin.trigger",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAliveAndUnused],
  calculate: [],
  stateUpdate: [updateExecutionStatus],
  postProcess: [
    async (context) => {
      const { meta, snapshot } = context;
      const nominator = meta.nominator;
      if (snapshot.votingPhase.isCancelled && nominator) {
        console.log(
          `处女技能触发，提名者${nominator.id}号玩家被直接处决，今日投票取消`
        );
      } else if (meta.isAbilityActive && nominator) {
        console.log(`处女技能未触发，提名者${nominator.id}号玩家不是镇民`);
      }
      return context;
    },
  ],
});
