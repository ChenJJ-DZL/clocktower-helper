import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 落难少女
 * TODO: 添加角色描述
 */
export const damsel: RoleDefinition = {
  id: "damsel",
  name: "落难少女",
  type: "outsider",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 0 : 0,
    
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
        wake: `唤醒${playerSeatId + 1}号玩家（落难少女）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（落难少女），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `落难少女（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
