import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 教父
 * TODO: 添加角色描述
 */
export const godfather: RoleDefinition = {
  id: "godfather",
  name: "教父",
  type: "minion",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 4 : 13,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（教父）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（教父），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `教父（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
