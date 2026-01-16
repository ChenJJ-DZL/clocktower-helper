import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 旅店老板
 * TODO: 添加角色描述
 */
export const innkeeper: RoleDefinition = {
  id: "innkeeper",
  name: "旅店老板",
  type: "townsfolk",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 0 : 2,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      if (isFirstNight) {
        return {
          wake: "",
          instruction: "",
          close: "",
        };
      }
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（旅店老板）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（旅店老板），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `旅店老板（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
