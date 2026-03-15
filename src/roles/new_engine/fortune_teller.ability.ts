/**
 * 占卜师（Fortune Teller）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
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

  const isDrunk = seat.statusEffects.some((e: any) => e.type === "drunk");
  const isPoisoned = seat.statusEffects.some((e: any) => e.type === "poisoned");
  const targetIds = (actionNode as any).targetIds ?? [];
  const targets = targetIds
    .map((id: string) => snapshot.seats.find((s) => s.id === id))
    .filter(Boolean);

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      isAbilityActive: !(isDrunk || isPoisoned),
      targets,
    },
  };
};

// 计算占卜结果
const calculateFortuneResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const targets = meta.targets ?? [];

  if (!isAbilityActive || targets.length !== 2) {
    // 醉酒/中毒时随机给出结果
    return {
      ...context,
      meta: {
        ...context.meta,
        result: Math.random() < 0.5,
      },
    };
  }

  // 检查目标中是否有恶魔，或隐士被判定为恶魔，或干扰项
  let hasDemon = false;
  for (const target of targets) {
    if (target.role.type === "demon") {
      hasDemon = true;
      break;
    }
    if (target.role.id === "recluse" && Math.random() < 0.5) {
      hasDemon = true;
      break;
    }
    // 检查是否是占卜师的干扰项
    if (target.id === (snapshot as any).fortuneTellerBaneId) {
      hasDemon = true;
      break;
    }
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      result: hasDemon,
    },
  };
};

export const fortuneTellerAbility = createRoleAbility({
  roleId: "fortune_teller",
  abilityId: "fortune_teller_night_scry",
  abilityName: "预知",
  triggerTiming: [
    AbilityTriggerTiming.FIRST_NIGHT,
    AbilityTriggerTiming.EVERY_NIGHT,
  ],
  wakePriority: 5,
  firstNightOnly: false,
  wakePromptId: "role.fortune_teller.wake",
  targetConfig: {
    min: 2,
    max: 2,
    allowSelf: true,
    allowDead: false,
  },
  preCheck: [preCheckAliveAndUnused],
  calculate: [calculateFortuneResult],
  stateUpdate: [],
  postProcess: [
    async (context) => {
      const { meta } = context;
      console.log(`占卜师得到结果：${meta.result ? "存在恶魔" : "不存在恶魔"}`);
      return context;
    },
  ],
});
