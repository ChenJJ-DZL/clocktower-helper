import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 数学家
 * TODO: 添加角色描述
 */
export const mathematician: RoleDefinition = {
  id: "mathematician",
  name: "数学家",
  type: "townsfolk",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 10 : 10,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（数学家）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（数学家），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `数学家（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
