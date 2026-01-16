import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 小恶魔 (Imp)
 * 首夜得知爪牙，非首夜选人杀害
 */
export const imp: RoleDefinition = {
  id: "imp",
  name: "小恶魔",
  type: "demon",
  
  // 首夜和后续夜晚都行动
  night: {
    order: (isFirstNight) => isFirstNight ? 2 : 20,
    
    target: {
      count: {
        min: isFirstNight ? 0 : 1,
        max: isFirstNight ? 0 : 1,
      },
      
      canSelect: (target: Seat, self: Seat, allSeats: Seat[], selectedTargets: number[]) => {
        // 首夜不需要选择目标（只是认队友）
        // 非首夜可以选择任何人（包括自己）
        return true;
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      if (isFirstNight) {
        return {
          wake: `唤醒${playerSeatId + 1}号玩家（小恶魔）。`,
          instruction: "认队友",
          close: `${playerSeatId + 1}号玩家（小恶魔），请闭眼。`,
        };
      }
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（小恶魔）。`,
        instruction: "选择一名玩家杀害",
        close: `${playerSeatId + 1}号玩家（小恶魔），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // 小恶魔的杀人逻辑在 calculateNightInfo 和 killPlayer 中处理
      // 这里只返回空更新
      if (context.gamePhase === "firstNight") {
        return {
          updates: [],
          logs: {
            privateLog: `小恶魔（${context.selfId + 1}号）已被告知爪牙信息`,
          },
        };
      }
      
      if (context.targets.length === 0) {
        return {
          updates: [],
          logs: {
            privateLog: `小恶魔（${context.selfId + 1}号）未选择目标`,
          },
        };
      }
      
      return {
        updates: [],
        logs: {
          privateLog: `小恶魔（${context.selfId + 1}号）选择了${context.targets[0] + 1}号玩家`,
        },
      };
    },
  },
};

