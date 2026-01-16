import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 筑梦师
 * TODO: 添加角色描述
 */
export const dreamer: RoleDefinition = {
  id: "dreamer",
  name: "筑梦师",
  type: "townsfolk",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 8 : 8,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（筑梦师）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（筑梦师），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `筑梦师（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
