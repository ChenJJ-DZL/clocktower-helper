import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 僧侣 (Monk)
 * 说明：每个夜晚*，你要选择除你以外的一名玩家：当晚恶魔的负面能力对他无效。
 */
export const monk: RoleDefinition = {
  id: "monk",
  name: "僧侣",
  type: "townsfolk",
  night: {
    order: (isFirstNight) => (isFirstNight ? 80 : 80),
    target: {
      count: { min: 1, max: 1 },
      canSelect: (target: Seat, self: Seat) => {
        // 不能选自己；默认只允许选择存活玩家
        return target.id !== self.id && !target.isDead;
      },
    },
    dialog: (playerSeatId: number) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（僧侣）。`,
        instruction: "请选择一名其他存活玩家进行保护（当晚恶魔无法杀死他）。",
        close: `${playerSeatId + 1}号玩家（僧侣），请闭眼。`,
      };
    },
    handler: (context) => {
      const { seats, targets, selfId } = context;

      if (targets.length !== 1) {
        return {
          updates: [],
          logs: {
            privateLog: `僧侣（${selfId + 1}号）未选择有效目标`,
          },
        };
      }

      const targetId = targets[0];
      const targetSeat = seats.find((s) => s.id === targetId);

      if (!targetSeat) {
        return {
          updates: [],
          logs: {
            privateLog: `僧侣（${selfId + 1}号）选择了无效目标`,
          },
        };
      }

      const statusDetails = [...(targetSeat.statusDetails || []), "僧侣保护"];
      const statuses = [
        ...(targetSeat.statuses || []),
        { effect: "Protected", duration: "至天亮", sourceId: selfId },
      ];

      return {
        updates: [
          {
            id: targetId,
            isProtected: true,
            protectedBy: selfId,
            statusDetails,
            statuses,
          },
        ],
        logs: {
          privateLog: `僧侣（${selfId + 1}号）保护了${targetId + 1}号玩家`,
        },
      };
    },
  },
};
