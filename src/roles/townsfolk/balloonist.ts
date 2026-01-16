import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 气球驾驶员
 * TODO: 添加角色描述
 */
export const balloonist: RoleDefinition = {
  id: "balloonist",
  name: "气球驾驶员",
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
        wake: `唤醒${playerSeatId + 1}号玩家（气球驾驶员）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（气球驾驶员），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `气球驾驶员（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
