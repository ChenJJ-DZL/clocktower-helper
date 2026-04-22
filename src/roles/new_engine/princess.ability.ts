import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

export const princessAbility = createRoleAbility({
  roleId: "princess",
  abilityId: "princess_first_day_execution",
  abilityName: "首日处决免死",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.princess.wake",
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
      console.log("公主在首个白天成功提名处决玩家后，当晚恶魔不会造成死亡");
      return context;
    },
  ],
});
