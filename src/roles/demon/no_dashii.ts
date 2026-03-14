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

    handler: undefined /* TODO: Migrate to OOP */,
  },
};
