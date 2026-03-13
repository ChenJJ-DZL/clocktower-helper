import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";
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

    dialog: (playerSeatId: number, isFirstNight: boolean, context) => {
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

    dialog: (playerSeatId: number, isFirstNight: boolean, context) => {
      return {
        wake: "🌸 每个夜晚*，你可以选择一名玩家：他死亡。如果你上次选择时没有选择任何玩家，当晚你要选择三名玩家：他们死亡。",
        instruction: '"你可以选择一名玩家杀死；如果你上次选择时没有选择任何玩家，当晚你要选择三名玩家杀死。"',
        close: "kill",
      };
    },

    handler: undefined, /* TODO: Migrate to OOP */

  },
};
