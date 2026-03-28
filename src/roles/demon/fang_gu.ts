import type { Seat } from "../../../app/data";
import type { RoleDefinition } from "../../types/roleDefinition";
import { buildDemonFirstNightDialog } from "./demonFirstNightHelper";

/**
 * 方古 (Fang Gu)
 * 每晚选一名玩家：他死亡。
 * 被该能力杀死的外来者改为变成邪恶的方古且你代替他死亡（整局仅首次成功转化生效）。
 */
export const fang_gu: RoleDefinition = {
  id: "fang_gu",
  name: "方古",
  type: "demon",
  detailedDescription: `【背景故事】
"你那高墙和锐器不过是虚无缥缈的泡影。"
【角色能力】
每个夜晚*，你要选择一名玩家：他死亡。
被该能力杀死的外来者改为变成邪恶的方古且你代替他死亡，但每局游戏仅能成功转化一次。[+1外来者]
【角色信息】
- 英文名：Fang Gu
- 所属剧本：梦殒春宵
- 角色类型：恶魔`,
  clarifications: [
    "相克规则：红唇女郎：如果方古成功转化了外来者并因此死去，红唇女郎不会变成方古。",
  ],

  firstNight: {
    order: 2,

    target: {
      count: { min: 0, max: 0 },
    },

    dialog: (playerSeatId: number, _isFirstNight: boolean, context) => {
      return buildDemonFirstNightDialog(playerSeatId, "方古", context);
    },

    handler: undefined,
  },

  night: {
    order: 4,

    target: {
      count: {
        min: 1,
        max: 1,
      },
    },

    dialog: (_playerSeatId: number, _isFirstNight: boolean, _context) => {
      return {
        wake: "⚔️ 选择一名玩家：他死亡。被该能力杀死的外来者改为变成邪恶的方古且你代替他死亡，但每局游戏仅能成功转化一次。",
        instruction:
          '"请选择一名玩家。他死亡。被该能力杀死的外来者改为变成邪恶的方古且你代替他死亡，但每局游戏仅能成功转化一次。"',
        close: "kill",
      };
    },

    handler: (context) => {
      const { targets, selfId, seats } = context;

      if (targets.length === 0) {
        return {
          updates: [],
          logs: {
            privateLog: `方古（${selfId + 1}号）未选择目标`,
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
            privateLog: `方古（${selfId + 1}号）攻击了 ${targetId + 1}号玩家，但目标被僧侣保护，攻击无效`,
          },
        };
      }

      // 检查目标是否是外来者
      const isTargetOutsider = targetSeat?.role?.type === "outsider";

      // 方古的攻击逻辑
      const updates: Array<Partial<Seat> & { id: number }> = [];

      if (isTargetOutsider) {
        // 首次成功转化：外来者变成方古，原方古死亡
        updates.push(
          {
            id: targetId,
            role: { id: "fang_gu", name: "方古", type: "demon" },
            isDead: false,
          },
          {
            id: selfId,
            isDead: true,
          }
        );

        return {
          updates,
          logs: {
            privateLog: `方古（${selfId + 1}号）攻击了 ${targetId + 1}号外来者，成功转化，原方古死亡`,
          },
        };
      } else {
        // 普通攻击或转化已使用
        updates.push({
          id: targetId,
          isDead: true,
        });

        return {
          updates,
          logs: {
            privateLog: `方古（${selfId + 1}号）攻击了 ${targetId + 1}号玩家`,
          },
        };
      }
    },
  },
};
