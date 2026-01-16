import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 教授
 * TODO: 添加角色描述
 */
export const professor: RoleDefinition = {
  id: "professor",
  name: "教授",
  type: "townsfolk",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 0 : 14,
    
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
        wake: `唤醒${playerSeatId + 1}号玩家（教授）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（教授），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `教授（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
