import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 守鸦人 (Ravenkeeper)
 * 夜晚死亡时唤醒，选择一名玩家，得知其真实角色
 */
export const ravenkeeper: RoleDefinition = {
  id: "ravenkeeper",
  name: "守鸦人",
  type: "townsfolk",
  
  // 只在非首夜行动（且仅在死亡时）
  night: {
    order: (isFirstNight) => isFirstNight ? 0 : 50,
    
    target: {
      count: {
        min: 0,
        max: 1,
      },
      
      canSelect: (target: Seat, self: Seat, allSeats: Seat[], selectedTargets: number[]) => {
        // 不能选死人
        return !target.isDead;
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
        wake: `唤醒${playerSeatId + 1}号玩家（守鸦人）。`,
        instruction: "如果死亡，选择一名玩家查验身份",
        close: `${playerSeatId + 1}号玩家（守鸦人），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // 守鸦人的查验逻辑在 calculateNightInfo 中处理
      // 这里只返回空更新，实际信息由说书人手动告知
      if (context.targets.length === 0) {
        return {
          updates: [],
          logs: {
            privateLog: `守鸦人（${context.selfId + 1}号）未选择目标`,
          },
        };
      }
      return {
        updates: [],
        logs: {
          privateLog: `守鸦人（${context.selfId + 1}号）查验了${context.targets[0] + 1}号玩家`,
        },
      };
    },
  },
};

