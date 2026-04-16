/**
 * 艺术家（Artist）新引擎技能实现
 *
 * 每局游戏限一次，在白天时，可以私下询问说书人一个是非问题，会得知该问题的答案。
 */

import {
  canUseLimitedAbility,
  useLimitedAbility,
} from "../../utils/LimitedAbilityManager";
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否已使用能力
const preCheckLimitedAbility = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { actionNode } = context;
  const seatId = actionNode.seatId;

  if (!canUseLimitedAbility(seatId, "artist_question")) {
    return {
      ...context,
      aborted: true,
      abortReason: "艺术家已经使用过能力了",
    };
  }

  return context;
};

// 状态更新：标记能力已使用
const markAbilityUsed = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { actionNode } = context;

  if (!context.aborted) {
    useLimitedAbility(actionNode.seatId, "artist_question");
  }

  return context;
};

export const artistAbility = createRoleAbility({
  roleId: "artist",
  abilityId: "artist_once_ability",
  abilityName: "提问",
  triggerTiming: [AbilityTriggerTiming.DAY],
  wakePriority: 1,
  firstNightOnly: false,
  wakePromptId: "role.artist.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive, preCheckLimitedAbility],
  calculate: [],
  stateUpdate: [markAbilityUsed],
  postProcess: [
    async (context) => {
      console.log("艺术家发动了提问技能");
      return context;
    },
  ],
});
