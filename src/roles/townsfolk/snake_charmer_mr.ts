import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 舞蛇人
 * TODO: 添加角色描述
 */
export const snake_charmer_mr: RoleDefinition = {
  id: "snake_charmer_mr",
  name: "舞蛇人",
  type: "townsfolk",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 9 : 9,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（舞蛇人）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（舞蛇人），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `舞蛇人（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
