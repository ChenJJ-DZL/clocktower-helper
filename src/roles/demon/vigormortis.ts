import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";
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

    dialog: (playerSeatId: number, isFirstNight: boolean, context) => {
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
      canSelect: (_target: Seat, _self: Seat, _allSeats: Seat[], _selectedTargets: number[]) => {
        return true;
      },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean, context) => {
      return {
        wake: "⚔️ 选择一名玩家：他死亡。被你杀死的爪牙保留他的能力，且与他邻近的两名镇民之一中毒。",
        instruction: '"请选择一名玩家。他死亡。被你杀死的爪牙保留他的能力，且与他邻近的两名镇民之一中毒。"',
        close: "kill",
      };
    },

    handler: undefined, /* TODO: Migrate to OOP */

  },
};
