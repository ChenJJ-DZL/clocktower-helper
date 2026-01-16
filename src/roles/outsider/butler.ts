import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 管家 (Butler)
 * 每晚选择一名主人，必须投票给主人
 */
export const butler: RoleDefinition = {
  id: "butler",
  name: "管家",
  type: "outsider",
  
  // 首夜和后续夜晚都行动
  night: {
    order: 26,
    
    target: {
      count: {
        min: 1,
        max: 1,
      },
      
      canSelect: (target: Seat, self: Seat, allSeats: Seat[], selectedTargets: number[]) => {
        // 不能选自己
        if (target.id === self.id) {
          return false;
        }
        // 不能选死人
        if (target.isDead) {
          return false;
        }
        return true;
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（管家）。`,
        instruction: "选择你的主人",
        close: `${playerSeatId + 1}号玩家（管家），请闭眼。`,
      };
    },
    
    handler: (context) => {
      const { seats, targets, selfId } = context;
      
      if (targets.length !== 1) {
        return {
          updates: [],
          logs: {
            privateLog: `管家（${selfId + 1}号）未选择有效目标`,
          },
        };
      }
      
      const targetId = targets[0];
      const targetSeat = seats.find(s => s.id === targetId);
      
      if (!targetSeat) {
        return {
          updates: [],
          logs: {
            privateLog: `管家（${selfId + 1}号）选择了无效目标`,
          },
        };
      }
      
      // 更新管家状态：设置主人
      const updates: Array<Partial<Seat> & { id: number }> = [
        {
          id: selfId,
          masterId: targetId,
          statusDetails: [...(context.seats.find(s => s.id === selfId)?.statusDetails || []), "主人"],
        },
      ];
      
      return {
        updates,
        logs: {
          privateLog: `管家（${selfId + 1}号）选择了${targetId + 1}号玩家作为主人`,
        },
      };
    },
  },
};

