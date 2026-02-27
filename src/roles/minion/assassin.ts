import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 刺客
 * TODO: 添加角色描述
 */
export const assassin: RoleDefinition = {
  id: "assassin",
  name: "刺客",
  type: "minion",

  night: {
    order: (isFirstNight) => isFirstNight ? 0 : 12,

    target: {
      count: {
        min: 1,
        max: 1,
      },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      if (isFirstNight) {
        return {
          wake: "",
          instruction: "",
          close: "",
        };
      }
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（刺客）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（刺客），请闭眼。`,
      };
    },

    handler: undefined, /* TODO: Migrate to OOP */

  },
};
