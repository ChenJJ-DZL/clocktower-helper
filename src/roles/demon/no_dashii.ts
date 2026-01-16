import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 诺-达
 * TODO: 添加角色描述
 */
export const no_dashii: RoleDefinition = {
  id: "no_dashii",
  name: "诺-达",
  type: "demon",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 2 : 6,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（诺-达）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（诺-达），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `诺-达（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
