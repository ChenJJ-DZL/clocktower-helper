import { RoleDefinition } from "../../types/roleDefinition";
import { NightActionContext, NightActionResult } from "../../types/roleDefinition";

/**
 * 厨师 (Chef)
 * 首夜获知相邻邪恶玩家对数
 */
export const chef: RoleDefinition = {
  id: "chef",
  name: "厨师",
  type: "townsfolk",
  
  // 只在首夜行动
  firstNight: {
    order: 10,
    
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
        wake: `唤醒${playerSeatId + 1}号玩家（厨师）。`,
        instruction: "向其展示手指数字：[X]（相邻邪恶玩家对数）。说书人需要计算座位环形排列中，相邻的两个邪恶玩家有多少对。",
        close: `${playerSeatId + 1}号玩家（厨师），请闭眼。`,
      };
    },
    
    handler: (context: NightActionContext): NightActionResult => {
      // 厨师是被动获取信息，不需要处理逻辑
      // 说书人根据 dialog 提示手动告知信息
      return {
        updates: [],
        logs: {
          privateLog: `厨师（${context.selfId + 1}号）已被告知相邻邪恶玩家对数`,
        },
      };
    },
  },
};

