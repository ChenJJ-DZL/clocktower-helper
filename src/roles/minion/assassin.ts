import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 刺客
 * TODO: 添加角色描述
 */
export const assassin: RoleDefinition = {
  id: "assassin",
  name: "刺客",
  type: "minion",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 0 : 12,
    
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
        wake: `唤醒${playerSeatId + 1}号玩家（刺客）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（刺客），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `刺客（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
