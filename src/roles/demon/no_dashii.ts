import type { Seat } from "../../../app/data";

import type { RoleDefinition } from "../../types/roleDefinition";
import { buildDemonFirstNightDialog } from "./demonFirstNightHelper";

/**
 * 诺-达鲺 (No Dashii)
 * 每晚选一名玩家：他死亡。与你邻近的两名镇民中毒。
 */
export const no_dashii: RoleDefinition = {
  id: "no_dashii",
  name: "诺-达",
  type: "demon",

  firstNight: {
    order: 2,

    target: {
      count: { min: 0, max: 0 },
    },

    dialog: (playerSeatId: number, _isFirstNight: boolean, context) => {
      return buildDemonFirstNightDialog(playerSeatId, "诺-达", context);
    },

    handler: undefined,
  },

  night: {
    order: 6,

    target: {
      count: {
        min: 1,
        max: 1,
      },
    },

    dialog: (_playerSeatId: number, _isFirstNight: boolean, _context) => {
      return {
        wake: "⚔️ 选择一名玩家：他死亡。与你邻近的两名镇民中毒。",
        instruction: '"请选择一名玩家。他死亡。与你邻近的两名镇民中毒。"',
        close: "kill",
      };
    },

    handler: (context) => {
      const { targets, selfId, seats } = context;

      if (targets.length === 0) {
        return {
          updates: [],
          logs: {
            privateLog: `僵怖（${selfId + 1}号）未选择目标`,
          },
        };
      }

      const targetId = targets[0];
      const targetSeat = seats.find((s) => s.id === targetId);
      const isTargetProtected =
        targetSeat?.statuses?.some((s) => s.effect === "Protected") ||
        targetSeat?.isProtected;

      // 如果目标被僧侣保护，攻击无效
      if (isTargetProtected) {
        return {
          updates: [],
          logs: {
            privateLog: `僵怖（${selfId + 1}号）攻击了 ${targetId + 1}号玩家，但目标被僧侣保护，攻击无效`,
          },
        };
      }

      const updates: Array<Partial<Seat> & { id: number }> = [];

      // 使目标死亡
      updates.push({
        id: targetId,
        isDead: true,
      });

      // 查找邻近的两名镇民
      const totalSeats = seats.length;
      const leftNeighborId = (selfId - 1 + totalSeats) % totalSeats;
      const rightNeighborId = (selfId + 1) % totalSeats;

      const leftNeighbor = seats.find((s) => s.id === leftNeighborId);
      const rightNeighbor = seats.find((s) => s.id === rightNeighborId);

      // 使邻近的镇民中毒
      if (leftNeighbor && leftNeighbor.role?.type === "townsfolk") {
        updates.push({
          id: leftNeighborId,
          isPoisoned: true,
        });
      }

      if (rightNeighbor && rightNeighbor.role?.type === "townsfolk") {
        updates.push({
          id: rightNeighborId,
          isPoisoned: true,
        });
      }

      return {
        updates,
        logs: {
          privateLog: `僵怖（${selfId + 1}号）攻击了 ${targetId + 1}号玩家，并使邻近镇民${leftNeighbor && leftNeighbor.role?.type === "townsfolk" ? `${leftNeighborId + 1}号` : ""}${leftNeighbor && leftNeighbor.role?.type === "townsfolk" && rightNeighbor && rightNeighbor.role?.type === "townsfolk" ? "、" : ""}${rightNeighbor && rightNeighbor.role?.type === "townsfolk" ? `${rightNeighborId + 1}号` : ""}中毒`,
        },
      };
    },
  },
};
