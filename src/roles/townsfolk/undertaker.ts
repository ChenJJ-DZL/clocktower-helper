import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 送葬者 (Undertaker)
 * 非首夜得知今天被处决并死亡的玩家角色
 */
export const undertaker: RoleDefinition = {
  id: "undertaker",
  name: "送葬者",
  type: "townsfolk",
  
  // 只在非首夜行动
  night: {
    order: (isFirstNight) => isFirstNight ? 0 : 40,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      if (isFirstNight) {
        // 首夜不唤醒
        return {
          wake: "",
          instruction: "",
          close: "",
        };
      }
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（送葬者）。`,
        instruction: "确认处决玩家的身份",
        close: `${playerSeatId + 1}号玩家（送葬者），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // 送葬者是被动获取信息，不需要处理逻辑
      // 说书人根据 dialog 提示手动告知信息
      return {
        updates: [],
        logs: {
          privateLog: `送葬者（${context.selfId + 1}号）已被告知处决玩家身份`,
        },
      };
    },
  },
};

