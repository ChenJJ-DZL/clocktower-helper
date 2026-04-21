import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

export const choirBoyAbility = createRoleAbility({
  roleId: "choir_boy",
  abilityId: "choir_boy_death_trigger",
  abilityName: "死亡触发得知恶魔",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.choir_boy.wake",
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
      console.log("唱诗男孩在国王死亡时会得知谁是恶魔");
      return context;
    },
  ],
});
