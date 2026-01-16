import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 占卜师 (Fortune Teller)
 * 每晚选择2名玩家，得知其中是否有恶魔或红罗刹
 */
export const fortune_teller: RoleDefinition = {
  id: "fortune_teller",
  name: "占卜师",
  type: "townsfolk",
  
  // 首夜和后续夜晚都行动
  night: {
    order: 25,
    
    target: {
      count: {
        min: 2,
        max: 2,
      },
      
      canSelect: (target: Seat, self: Seat, allSeats: Seat[], selectedTargets: number[]) => {
        // 可以选择自己
        // 不能选死人
        return !target.isDead;
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（占卜师）。`,
        instruction: "选择两名玩家进行查验",
        close: `${playerSeatId + 1}号玩家（占卜师），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // 占卜师的查验逻辑在 calculateNightInfo 中处理
      // 这里只返回空更新，实际信息由说书人手动告知
      return {
        updates: [],
        logs: {
          privateLog: `占卜师（${context.selfId + 1}号）查验了${context.targets.map(t => t + 1).join('、')}号玩家`,
        },
      };
    },
  },
};

