import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 管家 (Butler)
 * 每个夜晚，你要选择除你以外的一名玩家：明天白天，只有他投票时你才能投票。
 * 
 * 规则要点：
 * - 每个夜晚，管家需要选择一名玩家来成为自己的主人
 * - 如果主人在投票时举手，或主人的投票已经被统计时，管家可以举手参与投票
 * - 如果主人放下了他的手，表明他不参与投票，或在投票被统计前将手放下，管家也必须将自己的手放下
 * - 说书人没有监视管家的责任，管家需要为自己的投票负责
 * - 因为角色能力不能以任何形式影响流放流程，管家可以在流放表决中自由参与表决
 * - 已死亡的玩家只能在拥有投票标记时才能举手投票
 * - 管家的能力从不会被强制必须投票
 * - 管家的投票可以在他主人之前或之后被说书人计票，座次顺序并不重要
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
        // 可以选择已死亡的玩家（如果他有投票标记）
        return true;
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（管家）。`,
        instruction: "选择你的主人（除你以外的任意一名玩家）",
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
      // 注意：如果管家醉酒中毒，不放置"主人"标记
      const selfSeat = seats.find(s => s.id === selfId);
      const isDrunkOrPoisoned = selfSeat?.isDrunk || selfSeat?.isPoisoned;
      
      const updates: Array<Partial<Seat> & { id: number }> = [];
      
      if (!isDrunkOrPoisoned) {
        // 移除旧的"主人"标记（如果有）
        const currentStatusDetails = (selfSeat?.statusDetails || []).filter(
          (detail: string) => !detail.includes("主人") && !detail.includes(`主人:${targetId + 1}`)
        );
        
        updates.push({
          id: selfId,
          masterId: targetId,
          statusDetails: [...currentStatusDetails, `主人:${targetId + 1}`],
        });
        
        return {
          updates,
          logs: {
            privateLog: `管家（${selfId + 1}号）选择了${targetId + 1}号玩家作为主人`,
          },
        };
      } else {
        return {
          updates,
          logs: {
            privateLog: `管家（${selfId + 1}号）醉酒中毒，不放置主人标记`,
          },
        };
      }
    },
  },
};

