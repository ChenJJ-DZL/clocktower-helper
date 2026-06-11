import type { Seat } from "../../../app/data";
import type { RoleDefinition } from "../../types/roleDefinition";
import { buildDemonFirstNightDialog } from "../demon/demonFirstNightHelper";

/**
 * 塞壬
 * 每个夜晚*，选择一名玩家与一个角色：他得知自己是该角色，且必须如此扮演。
 */
export const cerenovus: RoleDefinition = {
  id: "cerenovus",
  name: "塞壬",
  type: "minion",
  detailedDescription: `【背景故事】
"我亲爱的，你看起来如此疲惫。来，让我为你唱一首摇篮曲，让你好好休息。"
【角色能力】
每个夜晚*，你可以选择一名玩家与一个角色：他得知自己是该角色，且必须如此扮演。
【角色信息】
- 英文名：Cerenovus
- 所属剧本：黯月初升
- 角色类型：爪牙`,

  firstNight: {
    order: 2,

    target: {
      count: { min: 0, max: 0 },
    },

    dialog: (playerSeatId: number, _isFirstNight: boolean, context) => {
      return buildDemonFirstNightDialog(playerSeatId, "塞壬", context);
    },
  },

  night: {
    order: 12,

    target: {
      count: {
        min: 1,
        max: 1,
      },
    },

    dialog: (_playerSeatId: number, _isFirstNight: boolean, _context) => {
      return {
        wake: "🎭 每个夜晚*，你可以选择一名玩家与一个角色：他得知自己是该角色，且必须如此扮演。",
        instruction:
          '"请选择一名玩家与一个角色。他得知自己是该角色，且必须如此扮演。"',
        close: "madness",
      };
    },
  },
};
