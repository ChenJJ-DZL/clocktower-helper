import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 亡骨魔
 * TODO: 添加角色描述
 */
export const vigormortis: RoleDefinition = {
  id: "vigormortis",
  name: "亡骨魔",
  type: "demon",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 2 : 5,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（亡骨魔）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（亡骨魔），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `亡骨魔（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
