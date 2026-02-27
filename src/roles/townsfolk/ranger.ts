import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 巡山人
 * TODO: 添加角色描述
 */
export const ranger: RoleDefinition = {
  id: "ranger",
  name: "巡山人",
  type: "townsfolk",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 11 : 14,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（巡山人）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（巡山人），请闭眼。`,
      };
    },
    
    handler: undefined, /* TODO: Migrate to OOP */

  },
};
