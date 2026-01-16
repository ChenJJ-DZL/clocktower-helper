import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 酒鬼
 * TODO: 添加角色描述
 */
export const drunk_mr: RoleDefinition = {
  id: "drunk_mr",
  name: "酒鬼",
  type: "outsider",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 0 : 0,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（酒鬼）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（酒鬼），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `酒鬼（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
