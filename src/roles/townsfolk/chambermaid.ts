import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 侍女
 * TODO: 添加角色描述
 */
export const chambermaid: RoleDefinition = {
  id: "chambermaid",
  name: "侍女",
  type: "townsfolk",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 8 : 15,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（侍女）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（侍女），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `侍女（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
