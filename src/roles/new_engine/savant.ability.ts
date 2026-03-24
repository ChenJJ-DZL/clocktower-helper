/**
 * 贤者（Savant）新引擎技能实现
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

// 计算结果：每天获得一个正确信息和一个错误信息
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;

  let result: { correct: string; incorrect: string };

  if (!isAbilityActive) {
    // 醉酒/中毒时两个信息都是错误的
    result = context.storytellerInput?.fakeResult ?? {
      correct: "虚假信息1",
      incorrect: "虚假信息2",
    };
  } else {
    // 正常情况：一个正确信息，一个错误信息
    result = context.storytellerInput?.result ?? {
      correct: "正确信息",
      incorrect: "错误信息",
    };
  }

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

export const savantAbility = createRoleAbility({
  roleId: "savant",
  abilityId: "savant_day_ability",
  abilityName: "每日信息",
  triggerTiming: [AbilityTriggerTiming.DAY],
  wakePriority: 5,
  firstNightOnly: false,
  wakePromptId: "role.savant.wake",
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
        `贤者获得信息：\n正确信息：${meta.abilityResult.correct}\n错误信息：${meta.abilityResult.incorrect}`
      );
      return context;
    },
  ],
});
