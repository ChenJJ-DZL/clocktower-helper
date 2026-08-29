/**
 * 猎手（Slayer）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否存活、是否已使用过技能
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
      abortReason: "猎手技能已使用过，无法再次触发",
    };
  }

  const isDrunk =
    (seat.statusEffects ?? []).some((e: any) => e.type === "drunk") ||
    (seat as any).isDrunk === true ||
    seat.role?.id === "drunk";
  const isPoisoned =
    (seat.statusEffects ?? []).some((e: any) => e.type === "poisoned") ||
    (seat as any).isPoisoned === true;
  const targetId =
    (actionNode as any).targetIds?.[0] ??
    context.targetIds?.[0] ??
    context.meta?.target?.id;
  const target =
    snapshot.seats.find((s) => s.id === targetId) ?? context.meta?.target;

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      isAbilityActive: !(isDrunk || isPoisoned),
      target,
    },
  };
};

// 状态更新：处理猎手技能触发
const handleSlayerKill = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const target = meta.target;

  if (!isAbilityActive || !target) {
    return {
      ...context,
      snapshot: {
        ...snapshot,
        seats: snapshot.seats.map((seat) => {
          if (seat.id === actionNode.seatId) {
            return { ...seat, abilityUsed: true };
          }
          return seat;
        }),
      },
    };
  }

  // 判定目标是否为恶魔：陌客默认注册为恶魔（可被射杀），间谍默认注册为好人（不被射杀）
  let isTargetDemon = target.role.type === "demon";
  if (target.role.id === "recluse") {
    isTargetDemon =
      (target as any).registerAsDemon !== false &&
      (target as any).registerAsEvil !== false;
  }
  if (target.role.id === "spy") {
    isTargetDemon = (target as any).registerAsDemon === true;
  }

  // 创建新快照：标记技能已使用
  const newSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat) => {
      if (seat.id === actionNode.seatId) {
        return { ...seat, abilityUsed: true };
      }
      if (seat.id === target.id && isTargetDemon) {
        return {
          ...seat,
          isAlive: false,
          deathReason: "被猎手杀死",
          deathPhase: "day",
        };
      }
      return seat;
    }),
  };

  // 如果恶魔死亡，游戏结束
  if (isTargetDemon) {
    (newSnapshot as any).gamePhase = "gameOver";
    (newSnapshot as any).gameResult = {
      winner: "good",
      reason: "恶魔被猎手猎杀，善良阵营获胜",
    };
  }

  return { ...context, snapshot: newSnapshot };
};

export const slayerAbility = createRoleAbility({
  roleId: "slayer",
  abilityId: "slayer_day_ability",
  abilityName: "狩魔",
  triggerTiming: [AbilityTriggerTiming.DAY],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.slayer.activate",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAliveAndUnused],
  calculate: [],
  stateUpdate: [handleSlayerKill],
  postProcess: [
    async (context) => {
      const { meta, snapshot } = context;
      const target = meta.target;
      if (snapshot.gamePhase === "gameOver") {
        console.log(`猎手成功猎杀恶魔${target.id}号玩家，善良阵营获胜！`);
      } else if (target && meta.isAbilityActive) {
        console.log(`猎手技能未命中，目标${target.id}号玩家不是恶魔`);
      }
      return context;
    },
  ],
});
