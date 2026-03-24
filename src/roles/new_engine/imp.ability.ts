/**
 * 小恶魔（Imp）新引擎技能实现
 */

import { addPoisonMark, getRandom } from "../../utils/gameRules";
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
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }

  const isDrunk = seat.statusEffects.some((e: any) => e.type === "drunk");
  const isPoisoned = seat.statusEffects.some((e: any) => e.type === "poisoned");

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      isAbilityActive: !(isDrunk || isPoisoned),
    },
  };
};

// 处理杀人逻辑
const handleKill = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode, meta, targetIds } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const impSeat = snapshot.seats.find((s) => s.id === actionNode.seatId);
  const targetSeatId = targetIds?.[0];

  if (!impSeat || !targetSeatId || !isAbilityActive) {
    return context;
  }

  const targetSeat = snapshot.seats.find((s) => s.id === targetSeatId);
  if (!targetSeat) return context;

  // 小恶魔自杀时，随机选择一名存活爪牙变成新的小恶魔
  const updatedSeats = [...snapshot.seats];
  if (targetSeatId === actionNode.seatId) {
    const aliveMinions = updatedSeats.filter(
      (s) => s.isAlive && s.roleType === "minion" && s.id !== actionNode.seatId
    );
    if (aliveMinions.length > 0) {
      const newImp = getRandom(aliveMinions);
      const newImpIndex = updatedSeats.findIndex((s) => s.id === newImp.id);
      updatedSeats[newImpIndex] = {
        ...updatedSeats[newImpIndex],
        roleId: "imp",
        roleType: "demon",
        roleName: "小恶魔",
        isDemonSuccessor: true,
        statusDetails: [
          ...(updatedSeats[newImpIndex].statusDetails || []),
          "被小恶魔传刀，成为新的小恶魔",
        ],
      };
      // 原小恶魔仍然死亡
    }
  }

  // 标记目标玩家将在夜晚结算时死亡
  const targetIndex = updatedSeats.findIndex((s) => s.id === targetSeatId);
  if (targetIndex !== -1) {
    updatedSeats[targetIndex] = {
      ...updatedSeats[targetIndex],
      markedForDeath: true,
      deathSource: "imp_kill",
      deathSourceSeatId: actionNode.seatId,
    };
  }

  return {
    ...context,
    snapshot: {
      ...snapshot,
      seats: updatedSeats,
    },
  };
};

export const impAbility = createRoleAbility({
  roleId: "imp",
  abilityId: "imp_night_ability",
  abilityName: "恶魔杀人与传刀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 40,
  firstNightOnly: false,
  wakePromptId: "role.imp.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: true,
    allowDead: false,
  },
  preCheck: [preCheckAliveAndStatus],
  calculate: [],
  stateUpdate: [handleKill],
  postProcess: [],
});
