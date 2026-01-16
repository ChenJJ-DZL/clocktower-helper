import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 侍臣
 * TODO: 添加角色描述
 */
export const courtier: RoleDefinition = {
  id: "courtier",
  name: "侍臣",
  type: "townsfolk",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 3 : 3,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（侍臣）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（侍臣），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `侍臣（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
