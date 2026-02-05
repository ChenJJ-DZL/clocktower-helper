import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 女巫
 * TODO: 添加角色描述
 */
export const witch: RoleDefinition = {
  id: "witch",
  name: "女巫",
  type: "minion",

  night: {
    order: (isFirstNight) => isFirstNight ? 13 : 1,

    target: {
      count: {
        min: 1,
        max: 1,
      },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（女巫）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（女巫），请闭眼。`,
      };
    },

    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `女巫（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
