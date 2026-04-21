import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

export const amnesiacAbility = createRoleAbility({
  roleId: "amnesiac",
  abilityId: "amnesiac_learn_ability",
  abilityName: "学习角色能力",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 50,
  firstNightOnly: true,
  wakePromptId: "role.amnesiac.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [],
  stateUpdate: [],
  postProcess: [
    async (context) => {
      console.log("失忆者在首夜会得知自己的角色能力");
      return context;
    },
  ],
});
