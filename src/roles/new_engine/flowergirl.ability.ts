/**
 * 卖花女孩（Flowergirl）新引擎技能实现
 *
 * 每个夜晚*，你会得知在今天白天时是否有恶魔投过票。
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

// 计算结果：确定恶魔是否投票
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const isVortoxWorld = snapshot.isVortoxWorld ?? false;

  // 从snapshot中获取恶魔今天是否投票的信息
  // 如果snapshot中没有这个信息，默认为false
  const demonVotedToday = snapshot.demonVotedToday ?? false;

  // 检查场上是否有涡流
  const hasVortox = snapshot.seats.some((s) => s.role?.id === "vortox");

  // 确定最终显示的信息
  let hasVoted = demonVotedToday;

  if (!isAbilityActive || hasVortox || isVortoxWorld) {
    // 醉酒/中毒/涡流时，信息反转
    hasVoted = !hasVoted;
  }

  const result = {
    hasVoted,
    actualVoted: demonVotedToday,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

export const flowergirlAbility = createRoleAbility({
  roleId: "flowergirl",
  abilityId: "flowergirl_nightly_ability",
  abilityName: "投票侦测",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 11,
  firstNightOnly: false,
  wakePromptId: "role.flowergirl.wake",
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
      const result = meta.abilityResult;
      if (result) {
        console.log(
          `卖花女孩得知：今天白天恶魔${result.hasVoted ? "有" : "没有"}投过票`
        );
      }
      return context;
    },
  ],
});
