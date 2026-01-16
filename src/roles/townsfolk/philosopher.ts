import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 哲学家
 * TODO: 添加角色描述
 */
export const philosopher: RoleDefinition = {
  id: "philosopher",
  name: "哲学家",
  type: "townsfolk",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 12 : 15,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（哲学家）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（哲学家），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `哲学家（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
