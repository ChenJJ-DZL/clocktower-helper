import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

export const priestessAbility = createRoleAbility({
  roleId: "priestess",
  abilityId: "priestess_nightly_info",
  abilityName: "每夜得知",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 30,
  firstNightOnly: false,
  wakePromptId: "role.priestess.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: true,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [],
  stateUpdate: [],
  postProcess: [
    async (context) => {
      console.log("女祭司得知了一名应该与其交流的玩家");
      return context;
    },
  ],
});
