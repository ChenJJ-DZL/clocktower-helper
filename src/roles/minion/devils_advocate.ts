import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 魔鬼代言人
 * TODO: 添加角色描述
 */
export const devils_advocate: RoleDefinition = {
  id: "devils_advocate",
  name: "魔鬼代言人",
  type: "minion",

  night: {
    order: (isFirstNight) => isFirstNight ? 5 : 5,

    target: {
      count: {
        min: 1,
        max: 1,
      },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（魔鬼代言人）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（魔鬼代言人），请闭眼。`,
      };
    },

    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `魔鬼代言人（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
