import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否为除首夜外的夜晚
const preCheckNightExceptFirst = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot } = context;

  if (snapshot.nightCount === 1) {
    return {
      ...context,
      aborted: true,
      abortReason: "星象师首夜不行动",
    };
  }

  return context;
};

export const astrologerAbility = createRoleAbility({
  roleId: "astrologer",
  abilityId: "astrologer_night_learn",
  abilityName: "夜晚学习",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 50,
  firstNightOnly: false,
  wakePromptId: "role.astrologer.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: true,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive, preCheckNightExceptFirst],
  calculate: [],
  stateUpdate: [],
  postProcess: [
    async (context) => {
      console.log(`星象师选择了玩家 ${context.targetIds[0]}`);
      return context;
    },
  ],
});
