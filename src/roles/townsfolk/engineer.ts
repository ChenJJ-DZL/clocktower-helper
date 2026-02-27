import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 工程师
 * TODO: 添加角色描述
 */
export const engineer: RoleDefinition = {
  id: "engineer",
  name: "工程师",
  type: "townsfolk",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 12 : 15,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（工程师）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（工程师），请闭眼。`,
      };
    },
    
    handler: undefined, /* TODO: Migrate to OOP */

  },
};
