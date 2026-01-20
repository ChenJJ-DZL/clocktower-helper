import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";
import { addPoisonMark, computeIsPoisoned } from "../../utils/gameRules";

/**
 * 投毒者 (Poisoner)
 * 每晚选一名玩家中毒，中毒者获得错误信息
 */
export const poisoner: RoleDefinition = {
  id: "poisoner",
  name: "投毒者",
  type: "minion",
  
  // 投毒者首夜和后续夜晚都行动
  night: {
    order: (isFirstNight) => isFirstNight ? 1 : 1,
    
    target: {
      count: {
        min: 1,
        max: 1,
      },
      
      canSelect: (target: Seat, self: Seat, allSeats: Seat[], selectedTargets: number[]) => {
        // 可以选任何人（包括自己）
        return true;
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（投毒者）。`,
        instruction: "请选择一名玩家进行下毒。",
        close: `${playerSeatId + 1}号玩家（投毒者），请闭眼。`,
      };
    },
    
    handler: (context) => {
      const { seats, targets, selfId } = context;
      
      if (targets.length !== 1) {
        // 无效目标数量
        return {
          updates: [],
          logs: {
            privateLog: `投毒者（${selfId + 1}号）未选择有效目标`,
          },
        };
      }
      
      const targetId = targets[0];
      const targetSeat = seats.find(s => s.id === targetId);
      
      if (!targetSeat) {
        return {
          updates: [],
          logs: {
            privateLog: `投毒者（${selfId + 1}号）选择了无效目标`,
          },
        };
      }
      
      // 投毒：当晚 + 次日白天中毒，黄昏清除
      const { statusDetails, statuses } = addPoisonMark(
        targetSeat,
        'poisoner',
        '次日黄昏清除'
      );
      
      const updates: Array<Partial<Seat> & { id: number }> = [
        {
          id: targetId,
          statusDetails,
          statuses,
          isPoisoned: computeIsPoisoned({ ...targetSeat, statusDetails, statuses }),
        },
      ];
      
      return {
        updates,
        logs: {
          privateLog: `投毒者（${selfId + 1}号）对${targetId + 1}号玩家下毒`,
        },
      };
    },
  },
};

