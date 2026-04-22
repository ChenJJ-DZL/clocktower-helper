import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

export const atheistAbility = createRoleAbility({
  roleId: "atheist",
  abilityId: "atheist_game_ending",
  abilityName: "无神论者胜利条件",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.atheist.wake",
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
      console.log(
        "无神论者在善良阵营获胜时，邪恶阵营获胜；在邪恶阵营获胜时，善良阵营获胜"
      );
      return context;
    },
  ],
});
