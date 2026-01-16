import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 疯子
 * TODO: 添加角色描述
 */
export const lunatic: RoleDefinition = {
  id: "lunatic",
  name: "疯子",
  type: "outsider",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 1 : 6,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（疯子）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（疯子），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `疯子（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
