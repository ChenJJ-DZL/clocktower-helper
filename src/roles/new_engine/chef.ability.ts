/**
 * 厨师（Chef）新引擎技能实现
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

// 计算结果：正常返回相邻邪恶对数，醉酒/中毒时返回虚假数字
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;

  let evilPairCount: number;

  if (!isAbilityActive) {
    // 醉酒/中毒时返回虚假信息，由说书人输入或生成看起来合理的错误值
    const realCount = meta.initialNightInfo?.chefInfo ?? 0;
    const possibleFakeValues = [0, 1, 2, 3].filter((v) => v !== realCount);
    evilPairCount =
      context.storytellerInput?.fakeResult ??
      possibleFakeValues[
        Math.floor(Math.random() * possibleFakeValues.length)
      ] ??
      Math.floor(Math.random() * 3);
  } else {
    // 正常情况：计算相邻的邪恶玩家对数
    // 处理陌客和间谍的互动干扰：每个相邻对独立判断阵营
    const seats = [...snapshot.seats];
    const seatCount = seats.length;
    evilPairCount = 0;

    for (let i = 0; i < seatCount; i++) {
      const currentSeat = seats[i];
      const nextSeat = seats[(i + 1) % seatCount];

      // 对每个相邻对独立判断是否都是邪恶
      // 陌客和间谍在每个判断中可以被当作不同阵营
      let currentIsEvil = currentSeat.alignment === "evil";
      let nextIsEvil = nextSeat.alignment === "evil";

      // 处理陌客（Recluse）：可能被当作邪恶
      if (currentSeat.roleId === "recluse") {
        // 50%概率被当作邪恶，官方建议保持一致性优先
        currentIsEvil = Math.random() < 0.5 ? true : currentIsEvil;
      }
      if (nextSeat.roleId === "recluse") {
        nextIsEvil = Math.random() < 0.5 ? true : nextIsEvil;
      }

      // 处理间谍（Spy）：可能被当作善良
      if (currentSeat.roleId === "spy") {
        // 50%概率被当作善良
        currentIsEvil = Math.random() < 0.5 ? false : currentIsEvil;
      }
      if (nextSeat.roleId === "spy") {
        nextIsEvil = Math.random() < 0.5 ? false : nextIsEvil;
      }

      if (currentIsEvil && nextIsEvil) {
        evilPairCount++;
      }
    }
  }

  return {
    ...context,
    meta: { ...context.meta, abilityResult: evilPairCount },
  };
};

export const chefAbility = createRoleAbility({
  roleId: "chef",
  abilityId: "chef_first_night_ability",
  abilityName: "邪恶邻座感知",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 13,
  firstNightOnly: true,
  wakePromptId: "role.chef.wake",
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
      console.log(`厨师获得信息：场上有${meta.abilityResult}对相邻的邪恶玩家`);
      return context;
    },
  ],
});
