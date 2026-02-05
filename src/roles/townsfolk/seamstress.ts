import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 女裁缝
 * TODO: 添加角色描述
 */
export const seamstress: RoleDefinition = {
  id: "seamstress",
  name: "女裁缝",
  type: "townsfolk",

  night: {
    order: (isFirstNight) => isFirstNight ? 11 : 14,

    target: {
      count: {
        min: 2,
        max: 2,
      },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（女裁缝）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（女裁缝），请闭眼。`,
      };
    },

    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `女裁缝（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
