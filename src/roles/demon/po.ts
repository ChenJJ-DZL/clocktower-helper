import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 珀
 * TODO: 添加角色描述
 */
export const po: RoleDefinition = {
  id: "po",
  name: "珀",
  type: "demon",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 2 : 11,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（珀）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（珀），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `珀（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
