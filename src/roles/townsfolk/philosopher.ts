import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 哲学家
 * TODO: 添加角色描述
 */
export const philosopher: RoleDefinition = {
  id: "philosopher",
  name: "哲学家",
  type: "townsfolk",

  night: {
    order: (isFirstNight) => isFirstNight ? 12 : 15,

    target: {
      count: {
        min: 1,
        max: 1,
      },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（哲学家）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（哲学家），请闭眼。`,
      };
    },

    handler: undefined, /* TODO: Migrate to OOP */

  },
};
