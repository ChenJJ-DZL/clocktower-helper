import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

export const bansheeAbility = createRoleAbility({
  roleId: "banshee",
  abilityId: "banshee_awake",
  abilityName: "报丧女妖觉醒",
  triggerTiming: [AbilityTriggerTiming.ON_DEATH],
  wakePriority: 86,
  firstNightOnly: false,
  wakePromptId: "role.banshee.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [],
  stateUpdate: [],
  postProcess: [],
});
