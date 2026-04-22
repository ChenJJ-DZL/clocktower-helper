import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

export const nobleAbility = createRoleAbility({
  roleId: "noble",
  abilityId: "noble_first_night_info",
  abilityName: "首夜得知",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 30,
  firstNightOnly: true,
  wakePromptId: "role.noble.wake",
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
      console.log("贵族得知了三名玩家，其中一名是邪恶的");
      return context;
    },
  ],
});
