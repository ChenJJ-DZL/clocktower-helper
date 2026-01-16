import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 洗脑师
 * TODO: 添加角色描述
 */
export const cerenovus: RoleDefinition = {
  id: "cerenovus",
  name: "洗脑师",
  type: "minion",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 14 : 2,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（洗脑师）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（洗脑师），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `洗脑师（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
