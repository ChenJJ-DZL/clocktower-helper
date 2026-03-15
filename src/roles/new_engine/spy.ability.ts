/**
 * 间谍（Spy）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否存活
const preCheckAlive = async (
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

// 被动效果：被查验时显示为善良阵营
const disguiseAsGood = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;

  if (!isAbilityActive) {
    return context;
  }

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
  preCheck: [preCheckAlive],
  calculate: [disguiseAsGood],
  stateUpdate: [],
  postProcess: [
    async (context) => {
      console.log("间谍查看了魔法书，获取了所有玩家的角色信息");
      return context;
    },
  ],
});
