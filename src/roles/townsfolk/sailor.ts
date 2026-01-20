import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 水手
 * TODO: 添加角色描述
 */
export const sailor: RoleDefinition = {
  id: "sailor",
  name: "水手",
  type: "townsfolk",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 2 : 1,
    
    target: {
      count: {
        min: 1,
        max: 1,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（水手）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（水手），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `水手（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
