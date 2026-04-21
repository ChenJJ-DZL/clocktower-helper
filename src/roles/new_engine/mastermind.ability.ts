/**
 * 主谋（Mastermind）新引擎技能实现
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

  return {
    ...context,
    meta: {
      ...context.meta,
      isAlive: true,
    },
  };
};

export const mastermindAbility = createRoleAbility({
  roleId: "mastermind",
  abilityId: "mastermind_game_extension",
  abilityName: "棋局延续",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAlive],
  calculate: [],
  stateUpdate: [],
  postProcess: [
    async (context) => {
      console.log("主谋能力：恶魔死亡时游戏继续");
      return context;
    },
  ],
});
