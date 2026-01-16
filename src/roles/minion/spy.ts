import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 间谍 (Spy)
 * 每晚查看魔典（所有真实身份）和完整行动日志
 */
export const spy: RoleDefinition = {
  id: "spy",
  name: "间谍",
  type: "minion",
  
  // 首夜和后续夜晚都行动
  night: {
    order: 45,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（间谍）。`,
        instruction: "查看魔法书",
        close: `${playerSeatId + 1}号玩家（间谍），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // 间谍是被动获取信息，不需要处理逻辑
      // 说书人根据 dialog 提示手动告知信息
      return {
        updates: [],
        logs: {
          privateLog: `间谍（${context.selfId + 1}号）已查看魔典`,
        },
      };
    },
  },
};

