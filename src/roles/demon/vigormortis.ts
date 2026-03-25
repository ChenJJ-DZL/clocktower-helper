import type { Seat } from "../../types/game";
import type { RoleDefinition } from "../../types/roleDefinition";
import { buildDemonFirstNightDialog } from "./demonFirstNightHelper";

/**
 * 亡骨魔 (Vigormortis)
 * 每晚选一名玩家：他死亡。
 * 被你杀死的爪牙保留其能力，且与其邻近的两名镇民之一中毒。
 */
export const vigormortis: RoleDefinition = {
  id: "vigormortis",
  name: "亡骨魔",
  type: "demon",
  detailedDescription: `【背景故事】
"世间万扉集为一体，世间万匙铸为一身。世间万盅将与我共饮，但凡饮下我所赐圣水者，必将永不干渴，化作万孔泉眼涌作永生。"
【角色能力】
每个夜晚*，你要选择一名玩家：他死亡。
被你杀死的爪牙保留他的能力，且与他邻近的两名镇民之一中毒。[-1外来者]
【角色信息】
- 英文名：Vigormortis
- 所属剧本：梦殒春宵
- 角色类型：恶魔`,

  firstNight: {
    order: 2,

    target: {
      count: { min: 0, max: 0 },
    },

    dialog: (playerSeatId: number, _isFirstNight: boolean, context) => {
      return buildDemonFirstNightDialog(playerSeatId, "亡骨魔", context);
    },

    handler: undefined,
  },

  night: {
    order: 5,

    target: {
      count: {
        min: 1,
        max: 1,
      },
      canSelect: (
        _target: Seat,
        _self: Seat,
        _allSeats: Seat[],
        _selectedTargets: number[]
      ) => {
        return true;
      },
    },

    dialog: (_playerSeatId: number, _isFirstNight: boolean, _context) => {
      return {
        wake: "⚔️ 选择一名玩家：他死亡。被你杀死的爪牙保留他的能力，且与他邻近的两名镇民之一中毒。",
        instruction:
          '"请选择一名玩家。他死亡。被你杀死的爪牙保留他的能力，且与他邻近的两名镇民之一中毒。"',
        close: "kill",
      };
    },

    handler: (context) => {
      const { targets, selfId, seats } = context;

      if (targets.length === 0) {
        return {
          updates: [],
          logs: {
            privateLog: `亡骨魔（${selfId + 1}号）未选择目标`,
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
            privateLog: `亡骨魔（${selfId + 1}号）攻击了 ${targetId + 1}号玩家，但目标被僧侣保护，攻击无效`,
          },
        };
      }

      const updates: Array<Partial<Seat> & { id: number }> = [];

      // 使目标死亡
      updates.push({
        id: targetId,
        isDead: true,
      });

      // 检查目标是否是爪牙
      const isTargetMinion = targetSeat?.role?.type === "minion";

      if (isTargetMinion) {
        // 爪牙保留能力（在游戏状态中标记）
        // 查找邻近的两名镇民
        const totalSeats = seats.length;
        const leftNeighborId = (targetId - 1 + totalSeats) % totalSeats;
        const rightNeighborId = (targetId + 1) % totalSeats;

        const leftNeighbor = seats.find((s) => s.id === leftNeighborId);
        const rightNeighbor = seats.find((s) => s.id === rightNeighborId);

        const neighboringTownsfolk = [];

        if (leftNeighbor && leftNeighbor.role?.type === "townsfolk") {
          neighboringTownsfolk.push(leftNeighborId);
        }

        if (rightNeighbor && rightNeighbor.role?.type === "townsfolk") {
          neighboringTownsfolk.push(rightNeighborId);
        }

        // 随机选择一名邻近镇民中毒（如果有的话）
        if (neighboringTownsfolk.length > 0) {
          const randomIndex = Math.floor(
            Math.random() * neighboringTownsfolk.length
          );
          const townsfoldToPoison = neighboringTownsfolk[randomIndex];

          updates.push({
            id: townsfoldToPoison,
            isPoisoned: true,
          });
        }
      }

      return {
        updates,
        logs: {
          privateLog: `亡骨魔（${selfId + 1}号）攻击了 ${targetId + 1}号玩家${isTargetMinion ? "（爪牙），邻近镇民中毒" : ""}`,
        },
      };
    },
  },
};
