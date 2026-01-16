import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 祖母
 * TODO: 添加角色描述
 */
export const grandmother: RoleDefinition = {
  id: "grandmother",
  name: "祖母",
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
        wake: `唤醒${playerSeatId + 1}号玩家（祖母）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（祖母），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `祖母（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
