/**
 * 间谍（Spy）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查玩家是否存在（死亡仍可使用间谍能力）
const preCheckSpy = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat) {
    return { ...context, aborted: true, abortReason: "玩家不存在" };
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
      // 间谍死亡后仍可被当作邪恶/爪牙/恶魔
      isDead: !seat.isAlive,
    },
  };
};

// 被动效果：被查验时显示为善良阵营（醉酒/中毒时效果被干扰）
const disguiseAsGood = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;

  if (!isAbilityActive) {
    // 醉酒/中毒时，说书人可决定是否显示真实身份或随机伪装
    return {
      ...context,
      meta: {
        ...context.meta,
        // 醉酒/中毒时，说书人可以决定是否显示为善良阵营
        overrideAlignment: Math.random() < 0.5 ? "good" : "evil",
      },
    };
  }

  // 正常状态下，间谍总是被当作善良阵营
  return {
    ...context,
    meta: {
      ...context.meta,
      overrideAlignment: "good",
      overrideRoleType: "townsfolk",
    },
  };
};

export const spyAbility = createRoleAbility({
  roleId: "spy",
  abilityId: "spy_grimoire_access",
  abilityName: "渗透者",
  triggerTiming: [
    AbilityTriggerTiming.FIRST_NIGHT,
    AbilityTriggerTiming.EVERY_NIGHT,
  ],
  wakePriority: 2, // 爪牙中优先级最高
  firstNightOnly: false,
  wakePromptId: "role.spy.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: true,
  },
  preCheck: [preCheckSpy],
  calculate: [disguiseAsGood],
  stateUpdate: [],
  postProcess: [
    async (context) => {
      console.log("间谍查看了魔法书，获取了所有玩家的角色信息");
      return context;
    },
  ],
});
