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
  
  // 首夜行动：认队友，不需要选择目标
  firstNight: {
    order: 2,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（小恶魔）。`,
        instruction: "认队友",
        close: `${playerSeatId + 1}号玩家（小恶魔），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // 小恶魔的认队友逻辑在 calculateNightInfo 中处理
      // 这里只返回空更新
      return {
        updates: [],
        logs: {
          privateLog: `小恶魔（${context.selfId + 1}号）已被告知爪牙信息`,
        },
      };
    },
  },
  
  // 后续夜晚行动：选择一名玩家杀害
  night: {
    order: 20,
    
    target: {
      count: {
        min: 1,
        max: 1,
      },
      
      canSelect: (target: Seat, self: Seat, allSeats: Seat[], selectedTargets: number[]) => {
        // 可以选择任何人（包括自己）
        return true;
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（小恶魔）。`,
        instruction: "选择一名玩家杀害",
        close: `${playerSeatId + 1}号玩家（小恶魔），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // 小恶魔的杀人逻辑在 calculateNightInfo 和 killPlayer 中处理
      // 这里只返回空更新
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

