import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

export const knightAbility = createRoleAbility({
  roleId: "knight",
  abilityId: "knight_first_night_info",
  abilityName: "首夜得知",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 30,
  firstNightOnly: true,
  wakePromptId: "role.knight.wake",
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
      console.log("骑士得知了两名非恶魔玩家");
      return context;
    },
  ],
});
