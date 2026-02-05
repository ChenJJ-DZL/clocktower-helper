import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 麻脸巫婆
 * TODO: 添加角色描述
 */
export const pit_hag: RoleDefinition = {
  id: "pit_hag",
  name: "麻脸巫婆",
  type: "minion",

  night: {
    order: (isFirstNight) => isFirstNight ? 15 : 3,

    target: {
      count: {
        min: 1,
        max: 1,
      },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（麻脸巫婆）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（麻脸巫婆），请闭眼。`,
      };
    },

    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `麻脸巫婆（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
