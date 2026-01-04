import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 僧侣 (Monk)
 * 非首夜保护一名玩家，防止恶魔杀害
 */
export const monk: RoleDefinition = {
  id: "monk",
  name: "僧侣",
  type: "townsfolk",
  
  // 僧侣只在非首夜行动
  night: {
    order: (isFirstNight) => isFirstNight ? 0 : 2,
    
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
        // 必须选活人
        if (target.isDead) {
          return false;
        }
        return true;
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
        wake: `唤醒${playerSeatId + 1}号玩家（僧侣）。`,
        instruction: "请选择一名玩家进行保护。",
        close: `${playerSeatId + 1}号玩家（僧侣），请闭眼。`,
      };
    },
    
    handler: (context) => {
      const { seats, targets, selfId } = context;
      
      if (targets.length !== 1) {
        // 无效目标数量
        return {
          updates: [],
          logs: {
            privateLog: `僧侣（${selfId + 1}号）未选择有效目标`,
          },
        };
      }
      
      const targetId = targets[0];
      const targetSeat = seats.find(s => s.id === targetId);
      
      if (!targetSeat) {
        return {
          updates: [],
          logs: {
            privateLog: `僧侣（${selfId + 1}号）选择了无效目标`,
          },
        };
      }
      
      // 更新目标状态：受保护
      const updates: Array<Partial<Seat> & { id: number }> = [
        {
          id: targetId,
          isProtected: true,
          protectedBy: selfId,
          statusDetails: [...(targetSeat.statusDetails || []), "僧侣保护"],
          statuses: [
            ...(targetSeat.statuses || []),
            {
              effect: "Protected",
              duration: "至天亮",
              sourceId: selfId,
            },
          ],
        },
      ];
      
      return {
        updates,
        logs: {
          privateLog: `僧侣（${selfId + 1}号）保护了${targetId + 1}号玩家`,
        },
      };
    },
  },
};

