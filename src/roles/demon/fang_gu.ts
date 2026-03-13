import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";
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
    `相克规则：红唇女郎：如果方古成功转化了外来者并因此死去，红唇女郎不会变成方古。`
  ],

  firstNight: {
    order: 2,

    target: {
      count: { min: 0, max: 0 },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean, context) => {
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

    dialog: (playerSeatId: number, isFirstNight: boolean, context) => {
      return {
        wake: "⚔️ 选择一名玩家：他死亡。被该能力杀死的外来者改为变成邪恶的方古且你代替他死亡，但每局游戏仅能成功转化一次。",
        instruction: '"请选择一名玩家。他死亡。被该能力杀死的外来者改为变成邪恶的方古且你代替他死亡，但每局游戏仅能成功转化一次。"',
        close: "kill",
      };
    },

    handler: undefined, /* TODO: Migrate to OOP */

  },
};
