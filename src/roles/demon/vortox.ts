import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 涡流
 * TODO: 添加角色描述
 */
export const vortox: RoleDefinition = {
  id: "vortox",
  name: "涡流",
  type: "demon",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 2 : 7,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（涡流）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（涡流），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `涡流（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
