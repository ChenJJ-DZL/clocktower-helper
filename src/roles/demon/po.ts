import type { Seat } from "../../../app/data";

import type { RoleDefinition } from "../../types/roleDefinition";
import { buildDemonFirstNightDialog } from "./demonFirstNightHelper";

/**
 * 珀
 * 每个夜晚*，可以选择一名玩家：他死亡。
 * 如果上次选择时没有选择任何玩家，当晚你要选择三名玩家：他们死亡。
 */
export const po: RoleDefinition = {
  id: "po",
  name: "珀",
  type: "demon",
  detailedDescription: `【背景故事】
"我给你一朵花，陪陪我好不好……"
【角色能力】
每个夜晚*，你可以选择一名玩家：他死亡。
如果你上次选择时没有选择任何玩家，当晚你要选择三名玩家：他们死亡。
【角色信息】
- 英文名：Po
- 所属剧本：黯月初升
- 角色类型：恶魔`,

  firstNight: {
    order: 2,

    target: {
      count: { min: 0, max: 0 },
    },

    dialog: (playerSeatId: number, _isFirstNight: boolean, context) => {
      return buildDemonFirstNightDialog(playerSeatId, "珀", context);
    },

    handler: undefined,
  },

  night: {
    order: 11,

    target: {
      count: {
        min: 0,
        max: 3,
      },
    },

    dialog: (_playerSeatId: number, _isFirstNight: boolean, _context) => {
      return {
        wake: "🌸 每个夜晚*，你可以选择一名玩家：他死亡。如果你上次选择时没有选择任何玩家，当晚你要选择三名玩家：他们死亡。",
        instruction:
          '"你可以选择一名玩家杀死；如果你上次选择时没有选择任何玩家，当晚你要选择三名玩家杀死。"',
        close: "kill",
      };
    },

    handler: (context) => {
      const { targets, selfId, seats } = context;

      // 珀的简化逻辑：总是允许选择0-3个目标
      // 注意：完整的珀逻辑需要跨夜晚的状态跟踪，这里简化处理
      if (targets.length > 3) {
        return {
          updates: [],
          logs: {
            privateLog: `珀（${selfId + 1}号）选择目标数量过多：最多3个目标，实际${targets.length}个`,
          },
        };
      }

      // 处理攻击逻辑
      const updates: Array<Partial<Seat> & { id: number }> = [];

      for (const targetId of targets) {
        const targetSeat = seats.find((s) => s.id === targetId);
        const isTargetProtected =
          targetSeat?.statuses?.some((s) => s.effect === "Protected") ||
          targetSeat?.isProtected;

        // 如果目标被僧侣保护，攻击无效
        if (isTargetProtected) {
          continue;
        }

        updates.push({
          id: targetId,
          isDead: true,
        });
      }

      return {
        updates,
        logs: {
          privateLog: `珀（${selfId + 1}号）攻击了 ${targets.map((t) => t + 1).join("、")}号玩家`,
        },
      };
    },
  },
};
