import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 哈迪寂亚
 * TODO: 添加角色描述
 */
export const hadesia: RoleDefinition = {
  id: "hadesia",
  name: "哈迪寂亚",
  type: "demon",

  night: {
    order: (isFirstNight) => isFirstNight ? 2 : 4,

    target: {
      count: {
        min: 0,
        max: 1,
      },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（哈迪寂亚）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（哈迪寂亚），请闭眼。`,
      };
    },

    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `哈迪寂亚（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
