import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 灵言师
 * TODO: 添加角色描述
 */
export const shaman: RoleDefinition = {
  id: "shaman",
  name: "灵言师",
  type: "minion",

  night: {
    order: (isFirstNight) => isFirstNight ? 13 : 0,

    target: {
      count: {
        min: 1,
        max: 1,
      },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      if (!isFirstNight) {
        return {
          wake: "",
          instruction: "",
          close: "",
        };
      }
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（灵言师）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（灵言师），请闭眼。`,
      };
    },

    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `灵言师（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
