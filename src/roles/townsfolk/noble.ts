import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 贵族
 * TODO: 添加角色描述
 */
export const noble: RoleDefinition = {
  id: "noble",
  name: "贵族",
  type: "townsfolk",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 7 : 0,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      if (!isFirstNight) {
        return {
          wake: "",
          instruction: "",
          close: "",
        };
      }
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（贵族）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（贵族），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `贵族（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
