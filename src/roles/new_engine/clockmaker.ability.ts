/**
 * 钟表匠（Clockmaker）新引擎技能实现
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

// 计算结果：计算恶魔与爪牙的最近距离
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;

  let minDistance: number;

  if (!isAbilityActive) {
    // 醉酒/中毒时返回虚假信息
    const realDistance = meta.initialNightInfo?.clockmakerInfo ?? 1;
    const possibleFakeValues = [0, 1, 2, 3, 4].filter(
      (v) => v !== realDistance
    );
    minDistance =
      context.storytellerInput?.fakeResult ??
      possibleFakeValues[
        Math.floor(Math.random() * possibleFakeValues.length)
      ] ??
      Math.floor(Math.random() * 4) + 1;
  } else {
    // 正常情况：计算所有恶魔与爪牙组合的最小距离
    const seats = [...snapshot.seats];
    const seatCount = seats.length;

    // 相克规则：如果召唤师在场，被视为恶魔
    const summonerInPlay = seats.some((s) => s.roleId === "summoner");

    const demons = seats.filter(
      (s) =>
        (s.role?.type === "demon" && s.isAlive) ||
        (summonerInPlay && s.roleId === "summoner" && s.isAlive)
    );
    const minions = seats.filter((s) => s.role?.type === "minion" && s.isAlive);

    if (demons.length === 0 || minions.length === 0) {
      minDistance = 0;
    } else {
      minDistance = seatCount;

      for (const demon of demons) {
        for (const minion of minions) {
          if (demon.id === minion.id) continue;

          // 计算环形距离
          const diff = Math.abs(demon.id - minion.id);
          const distance = Math.min(diff, seatCount - diff);

          if (distance < minDistance) {
            minDistance = distance;
          }
        }
      }
    }
  }

  return {
    ...context,
    meta: { ...context.meta, abilityResult: minDistance },
  };
};

export const clockmakerAbility = createRoleAbility({
  roleId: "clockmaker",
  abilityId: "clockmaker_first_night_ability",
  abilityName: "恶魔爪牙距离感知",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 4,
  firstNightOnly: true,
  wakePromptId: "role.clockmaker.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAliveAndStatus],
  calculate: [calculateResult],
  stateUpdate: [],
  postProcess: [
    async (context) => {
      const { meta } = context;
      console.log(
        `钟表匠获得信息：恶魔与爪牙的最近距离为 ${meta.abilityResult}`
      );
      return context;
    },
  ],
});
