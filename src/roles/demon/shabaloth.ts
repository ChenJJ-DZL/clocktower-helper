import type { RoleDefinition } from "../../types/roleDefinition";
import { buildDemonFirstNightDialog } from "./demonFirstNightHelper";

/**
 * 沙巴洛斯
 * 每个夜晚*，选择两名玩家：他们死亡。上个夜晚选择过且当前死亡的玩家之一可能会被你反刍。
 */
export const shabaloth: RoleDefinition = {
  id: "shabaloth",
  name: "沙巴洛斯",
  type: "demon",
  detailedDescription: `【背景故事】
"布嘞啦嘎，福塔啊啊嘎，呐姆姆啊塔噶！呐什，噶姆塔姆什，呐哟咯咯发咯咯咯咯咯咯嘎，哈什嗝呵！"
【角色能力】
每个夜晚*，你要选择两名玩家：他们死亡。
你上个夜晚选择过且当前死亡的玩家之一可能会被你反刍。
【角色信息】
- 英文名：Shabaloth
- 所属剧本：黯月初升
- 角色类型：恶魔`,
  clarifications: [
    "关于沙巴洛斯造成的反刍所带来的首夜能力使用时机的疑问：在这三个官方剧本中，角色详解通常只用于解决剧本内的一些互动方式，如果将角色互动拉到全角色和混合剧本的维度，则需要使用到统一的规则。在黯月初升中，因为只会至多有一名恶魔在场，并且爪牙发起攻击的情形不太常见，所以在大部分情况下，你可以让反刍的角色在沙巴洛斯的行动结束后立即行动。然而如果是混合剧本，则需要综合考虑，选择更准确的，不会出错的处理方式进行游戏的主持。",
  ],

  firstNight: {
    order: 2,

    target: {
      count: { min: 0, max: 0 },
    },

    dialog: (playerSeatId: number, _isFirstNight: boolean, context) => {
      return buildDemonFirstNightDialog(playerSeatId, "沙巴洛斯", context);
    },

    handler: undefined,
  },

  night: {
    order: 10,

    target: {
      count: {
        min: 2,
        max: 2,
      },
    },

    dialog: (_playerSeatId: number, _isFirstNight: boolean, _context) => {
      return {
        wake: "🐍 每个夜晚*，你要选择两名玩家：他们死亡。你上个夜晚选择过且当前死亡的玩家之一可能会被你反刍。",
        instruction:
          '"请选择两名玩家。他们死亡。上个夜晚选择过且当前死亡的玩家之一可能会被你反刍。"',
        close: "kill",
      };
    },

    handler: (context) => {
      const { targets, selfId, seats, gameState } = context;

      if (targets.length !== 2) {
        return {
          updates: [],
          logs: {
            privateLog: `沙巴洛斯（${selfId + 1}号）需要选择2名玩家，实际选择了${targets.length}名`,
          },
        };
      }

      // 获取沙巴洛斯上次选择的玩家
      const shabalothLastTargets = gameState?.shabalothLastTargets ?? [];

      const updates: Array<Partial<Seat> & { id: number }> = [];

      // 处理反刍（复活）逻辑
      if (shabalothLastTargets.length > 0) {
        // 找出上次选择且当前死亡的玩家
        const deadLastTargets = shabalothLastTargets.filter((targetId) => {
          const seat = seats.find((s) => s.id === targetId);
          return seat && seat.isDead;
        });

        // 随机选择一个死亡玩家复活（如果有的话）
        if (deadLastTargets.length > 0) {
          const randomIndex = Math.floor(
            Math.random() * deadLastTargets.length
          );
          const targetToRevive = deadLastTargets[randomIndex];

          updates.push({
            id: targetToRevive,
            isDead: false,
            statusDetails: [
              ...(seats.find((s) => s.id === targetToRevive)?.statusDetails ||
                []),
              "沙巴洛斯反刍复活",
            ],
          });
        }
      }

      // 使新目标死亡
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
          privateLog: `沙巴洛斯（${selfId + 1}号）攻击了 ${targets.map((t) => t + 1).join("、")}号玩家，上次目标${shabalothLastTargets.map((t) => t + 1).join("、")}，反刍复活了${updates.some((u) => !u.isDead) ? "1名玩家" : "无"}`,
        },
        gameStateUpdates: {
          shabalothLastTargets: targets,
        },
      };
    },
  },
};
