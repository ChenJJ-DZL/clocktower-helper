import type { Seat } from "../../types/game";
import type { RoleDefinition } from "../../types/roleDefinition";
import { buildDemonFirstNightDialog } from "./demonFirstNightHelper";

/**
 * 普卡
 * 每个夜晚，选择一名玩家：他中毒。上个因你的能力中毒的玩家会死亡并恢复健康。
 */
export const pukka: RoleDefinition = {
  id: "pukka",
  name: "普卡",
  type: "demon",
  detailedDescription: `【背景故事】
"您人真好，发生了这样的事情，您还愿意让我来您金碧辉煌的家里做客。我很抱歉，刚才不小心划伤了您。这是一点点赔礼，没事的，请收下吧，把这根金牙签当做我那卑微的歉意吧。"
【角色能力】
每个夜晚，你要选择一名玩家：他中毒。
上个因你的能力中毒的玩家会死亡并恢复健康。
【角色简介】
普卡能让他的受害者中毒，并在之后毒发身亡。
- 当普卡攻击时，他的受害者会立即中毒。在下一个夜晚，该名玩家会在普卡发起下一次攻击之后的时间点死亡。
- 不同于其他恶魔，普卡在首个夜晚就会行动。
- 驱魔人能防止普卡被唤醒来使玩家中毒。旅店老板能防止普卡杀死已经中毒的玩家，随后该玩家会恢复健康。
- 如果醉酒状态的普卡选择了一名玩家，该玩家不会中毒，也不会在下一个夜晚死亡。
- 如果普卡在上一个夜晚选择玩家时是清醒的，但是当晚醉酒了，该玩家不会死亡。但是当普卡恢复清醒，中毒效果会恢复，且会在随后的夜晚杀死该玩家。
【角色信息】
- 英文名：Pukka
- 所属剧本：黯月初升
- 角色类型：恶魔`,
  clarifications: [
    "相克规则：召唤师：召唤师可以选择在第二个夜晚将一名玩家变成普卡。",
    `相克规则（与华灯系列角色）：戏子：在戏子存在于剧本中时，普卡可以在游戏中任意时候向说书人示意自己"想要死亡"。说书人会在当晚杀死这名玩家。戏子（改）：在戏子（改）存在于剧本中时，普卡可以在游戏中任意时候向说书人示意自己"想要死亡"。说书人会在当晚杀死这名玩家。`,
  ],

  firstNight: {
    order: 6,

    target: {
      count: { min: 0, max: 0 },
    },

    dialog: (playerSeatId: number, _isFirstNight: boolean, context) => {
      return buildDemonFirstNightDialog(playerSeatId, "普卡", context);
    },

    handler: undefined,
  },

  night: {
    order: 9,

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
        // 普卡可以选择任何人（包括自己）
        return true;
      },
    },

    dialog: (_playerSeatId: number, _isFirstNight: boolean, _context) => {
      return {
        wake: "☠️ 每个夜晚，你要选择一名玩家：他中毒。上个因你的能力中毒的玩家会死亡并恢复健康。",
        instruction:
          '"请选择一名玩家。他现在中毒。上个因你的能力中毒的玩家会死亡并恢复健康。"',
        close: "poison",
      };
    },

    handler: (context) => {
      const { targets, selfId, seats, gameState } = context;

      if (targets.length === 0) {
        return {
          updates: [],
          logs: {
            privateLog: `普卡（${selfId + 1}号）未选择目标`,
          },
        };
      }

      const targetId = targets[0];
      const targetSeat = seats.find((s) => s.id === targetId);

      // 获取普卡上次中毒的玩家
      const pukkaLastPoisoned = gameState?.pukkaLastPoisoned;

      const updates: Array<Partial<Seat> & { id: number }> = [];

      // 处理上个中毒玩家的死亡
      if (pukkaLastPoisoned !== undefined && pukkaLastPoisoned !== null) {
        const lastPoisonedSeat = seats.find((s) => s.id === pukkaLastPoisoned);
        if (lastPoisonedSeat && !lastPoisonedSeat.isDead) {
          // 检查是否被旅店老板保护
          const isProtectedByInnkeeper = lastPoisonedSeat.statuses?.some(
            (s) => s.effect === "ProtectedByInnkeeper"
          );

          if (!isProtectedByInnkeeper) {
            updates.push({
              id: pukkaLastPoisoned,
              isDead: true,
              isPoisoned: false, // 死亡后恢复健康
            });
          }
        }
      }

      // 使新目标中毒
      updates.push({
        id: targetId,
        isPoisoned: true,
      });

      return {
        updates,
        logs: {
          privateLog: `普卡（${selfId + 1}号）使 ${targetId + 1}号玩家中毒，上个中毒玩家${pukkaLastPoisoned !== undefined ? pukkaLastPoisoned + 1 : "无"}死亡`,
        },
        gameStateUpdates: {
          pukkaLastPoisoned: targetId,
        },
      };
    },
  },
};
