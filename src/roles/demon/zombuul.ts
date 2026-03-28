import type { Seat } from "../../../app/data";

import type {
  ExecutionContext,
  ExecutionResult,
  RoleDefinition,
} from "../../types/roleDefinition";
import { buildDemonFirstNightDialog } from "./demonFirstNightHelper";

/**
 * 僵怖
 * 第一次被处决时假死，保留夜间行动但消耗一次生命
 */
export const zombuul: RoleDefinition = {
  id: "zombuul",
  name: "僵怖",
  type: "demon",
  detailedDescription: `【背景故事】
"我不。明白。你的。方式。人类。同类。向我。指引。泥土。那是。圣地。静卧。安睡。我也。必须。长眠。立刻。"
【角色能力】
每个夜晚*，如果今天白天没有人死亡，你会被唤醒并要选择一名玩家：他死亡。
当你首次死亡后，你仍存活，但会被当作死亡。
【角色信息】
- 英文名：Zombuul
- 所属剧本：黯月初升
- 角色类型：恶魔`,
  clarifications: [
    `相克规则：召唤师：如果召唤师将一名已死亡的玩家变成了僵怖，该玩家会变成"已经死过一次"的僵怖。`,
    `相克规则（与华灯系列角色）：戏子：在戏子存在于剧本中时，僵怖可以在游戏中任意时候向说书人示意自己"想要死亡"。无论僵怖是否触发过"假死"，当晚僵怖会变为死亡状态。戏子（改）：在戏子（改）存在于剧本中时，僵怖可以在游戏中任意时候向说书人示意自己"想要死亡"。无论僵怖是否触发过"假死"，当晚僵怖会变为死亡状态。`,
  ],

  firstNight: {
    order: 0,

    target: {
      count: { min: 0, max: 0 },
    },

    dialog: (playerSeatId: number, _isFirstNight: boolean, context) => {
      return buildDemonFirstNightDialog(playerSeatId, "僵怖", context);
    },

    handler: undefined,
  },

  night: {
    order: 8,

    target: {
      count: {
        min: 0,
        max: 1,
      },
    },

    dialog: (_playerSeatId: number, _isFirstNight: boolean, context) => {
      const { lastDuskExecution } = context;

      if (lastDuskExecution === null) {
        // 白天没有人死亡，僵怖被唤醒
        return {
          wake: "⚰️ 每个夜晚*，如果今天白天没有人死亡，你会被唤醒并要选择一名玩家：他死亡。当你首次死亡后，你仍存活，但会被当作死亡。",
          instruction: '"请选择一名玩家。他死亡。"',
          close: "kill",
        };
      } else {
        // 白天有人死亡，僵怖不应该被唤醒
        return {
          wake: "💤 今天白天有人死亡，你不会被唤醒。",
          instruction: '"今天白天有人死亡，你不会被唤醒。"',
          close: "skip",
        };
      }
    },

    handler: (context) => {
      const { targets, selfId, seats, lastDuskExecution } = context;

      // 如果白天有人死亡，僵怖不应该被唤醒（由dialog处理）
      if (lastDuskExecution !== null) {
        return {
          updates: [],
          logs: {
            privateLog: `僵怖（${selfId + 1}号）：今天白天有人死亡，未被唤醒`,
          },
        };
      }

      // 检查是否应该被唤醒（白天无人死亡）
      if (targets.length === 0) {
        // 没有选择目标（可能是空刀）
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

      // 僵怖的攻击逻辑
      const updates: Array<Partial<Seat> & { id: number }> = [
        {
          id: targetId,
          isDead: true,
        },
      ];

      return {
        updates,
        logs: {
          privateLog: `僵怖（${selfId + 1}号）攻击了 ${targetId + 1}号玩家`,
        },
      };
    },
  },

  /**
   * 僵怖被处决时的特殊处理
   * 第一次被处决时假死，保留夜间行动
   */
  onExecution: (context: ExecutionContext): ExecutionResult => {
    const { executedSeat } = context;
    const zombuulLives = executedSeat.zombuulLives ?? 1;

    // 如果还有生命且是第一次假死
    if (
      zombuulLives > 0 &&
      !executedSeat.isZombuulTrulyDead &&
      !executedSeat.isFirstDeathForZombuul
    ) {
      const details = executedSeat.statusDetails || [];
      const hasFakeDeathTag = details.includes("僵怖假死");

      return {
        handled: true,
        seatUpdates: [
          {
            id: executedSeat.id,
            isDead: false, // 假死，逻辑上仍视为存活
            isFirstDeathForZombuul: true,
            isZombuulTrulyDead: false,
            zombuulLives: Math.max(0, zombuulLives - 1),
            statusDetails: hasFakeDeathTag ? details : [...details, "僵怖假死"],
          },
        ],
        logs: {
          publicLog: `${executedSeat.id + 1}号僵 被处决假死游戏继续`,
        },
        shouldContinueToNight: true, // 继续到下一个夜晚
      };
    }

    // 如果生命耗尽，真正死亡
    if (zombuulLives <= 0 || executedSeat.isZombuulTrulyDead) {
      return {
        handled: true,
        seatUpdates: [
          {
            id: executedSeat.id,
            isDead: true,
            isZombuulTrulyDead: true,
            zombuulLives: 0,
          },
        ],
        gameOver: {
          winResult: "good",
          winReason: "僵怖被处决",
        },
        logs: {
          publicLog: `${executedSeat.id + 1}号僵 被处决真正死亡`,
          privateLog: "游戏结束：僵怖被处决，好人阵营获胜",
        },
      };
    }

    // 默认处理
    return {
      handled: false,
    };
  },
};
