import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 沙巴洛斯
 * TODO: 添加角色描述
 */
export const shabaloth: RoleDefinition = {
  id: "shabaloth",
  name: "沙巴洛斯",
  type: "demon",

  night: {
    order: (isFirstNight) => isFirstNight ? 2 : 10,

    target: {
      count: {
        min: 2,
        max: 2,
      },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（沙巴洛斯）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（沙巴洛斯），请闭眼。`,
      };
    },

    handler: undefined, /* TODO: Migrate to OOP */

  },
};
