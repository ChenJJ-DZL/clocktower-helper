import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 食人魔 (Ogre)
 * 在你的首个夜晚，你要选择除你以外的一名玩家：你转变为他的阵营，即使你已醉酒或中毒，但你不知道你转变后的阵营。
 * 
 * 规则要点：
 * - 食人魔选定了玩家之后，他的目标就不会发生变化，即使他在选择时醉酒或中毒也是如此
 * - 食人魔会在他的首个夜晚选择玩家后立即转变为那名玩家的阵营
 * - 说书人不会告知食人魔转变后的阵营
 * - 如果随后食人魔的阵营因为其他方式发生变化，食人魔会如常得知他转变后的阵营
 * - 如果食人魔在游戏中途被创造，他需要在当晚选择一名玩家，并转变为那名玩家的阵营
 * - 可选规则（15人及以上）：使用"挚友"提示标记，食人魔始终与他所选择的玩家同一阵营
 */
export const ogre: RoleDefinition = {
  id: "ogre",
  name: "食人魔",
  type: "outsider",
  
  firstNight: {
    order: 27,
    
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
        return true;
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（食人魔）。`,
        instruction: "选择除你以外的一名玩家作为你的挚友",
        close: `${playerSeatId + 1}号玩家（食人魔），请闭眼。`,
      };
    },
    
    handler: (context) => {
      const { seats, targets, selfId } = context;
      
      if (targets.length !== 1) {
        return {
          updates: [],
          logs: {
            privateLog: `食人魔（${selfId + 1}号）未选择有效目标`,
          },
        };
      }
      
      const targetId = targets[0];
      const targetSeat = seats.find(s => s.id === targetId);
      
      if (!targetSeat) {
        return {
          updates: [],
          logs: {
            privateLog: `食人魔（${selfId + 1}号）选择了无效目标`,
          },
        };
      }
      
      // 食人魔转变为目标玩家的阵营
      // 如果目标是邪恶玩家，食人魔转为邪恶；否则保持善良
      const targetIsEvil = targetSeat.role?.type === 'demon' || targetSeat.role?.type === 'minion';
      
      const selfSeat = seats.find(s => s.id === selfId);
      const currentStatusDetails = (selfSeat?.statusDetails || []).filter(
        (detail: string) => !detail.includes("挚友")
      );
      
      const updates: Array<Partial<Seat> & { id: number }> = [
        {
          id: selfId,
          statusDetails: [...currentStatusDetails, `挚友:${targetId + 1}`],
          // 如果转为邪恶，需要翻转阵营
          // 注意：阵营翻转在游戏逻辑中通过角色标记翻转来处理
          isEvilConverted: targetIsEvil ? true : undefined,
        },
      ];
      
      return {
        updates,
        logs: {
          privateLog: `食人魔（${selfId + 1}号）选择了${targetId + 1}号玩家作为挚友，转变为${targetIsEvil ? '邪恶' : '善良'}阵营（不告知食人魔）`,
        },
      };
    },
  },
};

