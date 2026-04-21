import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

export const pilgrimAbility = createRoleAbility({
  roleId: "pilgrim",
  abilityId: "pilgrim_first_night_info",
  abilityName: "首夜得知",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 30,
  firstNightOnly: true,
  wakePromptId: "role.pilgrim.wake",
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
      console.log("修行者得知了距离最近的邪恶玩家方向");
      return context;
    },
  ],
});
