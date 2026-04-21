import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

export const farmerAbility = createRoleAbility({
  roleId: "farmer",
  abilityId: "farmer_death_transfer",
  abilityName: "死亡角色转移",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.farmer.wake",
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
      console.log("当农夫在夜晚死亡时，一名存活的善良玩家会变成农夫");
      return context;
    },
  ],
});
