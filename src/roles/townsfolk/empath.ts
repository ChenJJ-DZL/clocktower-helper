import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 共情者 (Empath)
 * 每晚得知存活邻居中邪恶玩家的数量
 */
export const empath: RoleDefinition = {
  id: "empath",
  name: "共情者",
  type: "townsfolk",
  
  // 首夜和后续夜晚都行动
  night: {
    order: 24,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（共情者）。`,
        instruction: "请用手指比出邻近邪恶数",
        close: `${playerSeatId + 1}号玩家（共情者），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // 共情者是被动获取信息，不需要处理逻辑
      // 说书人根据 dialog 提示手动告知信息
      return {
        updates: [],
        logs: {
          privateLog: `共情者（${context.selfId + 1}号）已被告知信息`,
        },
      };
    },
  },
};

