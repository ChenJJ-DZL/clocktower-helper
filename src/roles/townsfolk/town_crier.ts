import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 城镇公告员
 * TODO: 添加角色描述
 */
export const town_crier: RoleDefinition = {
  id: "town_crier",
  name: "城镇公告员",
  type: "townsfolk",
  
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
        wake: `唤醒${playerSeatId + 1}号玩家（城镇公告员）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（城镇公告员），请闭眼。`,
      };
    },
    
    handler: undefined, /* TODO: Migrate to OOP */

  },
};
