import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 普卡
 * TODO: 添加角色描述
 */
export const pukka: RoleDefinition = {
  id: "pukka",
  name: "普卡",
  type: "demon",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 6 : 9,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（普卡）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（普卡），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `普卡（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
