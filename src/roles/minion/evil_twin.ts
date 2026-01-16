import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 镜像双子
 * TODO: 添加角色描述
 */
export const evil_twin: RoleDefinition = {
  id: "evil_twin",
  name: "镜像双子",
  type: "minion",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 3 : 0,
    
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
        wake: `唤醒${playerSeatId + 1}号玩家（镜像双子）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（镜像双子），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `镜像双子（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
