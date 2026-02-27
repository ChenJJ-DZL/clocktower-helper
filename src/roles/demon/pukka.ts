import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 普卡
 * TODO: 添加角色描述
 */
export const pukka: RoleDefinition = {
  id: "pukka",
  name: "普卡",
  type: "demon",

  night: {
    order: (isFirstNight) => isFirstNight ? 6 : 9,

    target: {
      count: {
        min: 1,
        max: 1,
      },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（普卡）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（普卡），请闭眼。`,
      };
    },

    handler: undefined, /* TODO: Migrate to OOP */

  },
};
