import type { RoleDefinition } from "../../types/roleDefinition";
import { buildDemonFirstNightDialog } from "./demonFirstNightHelper";

/**
 * 涡流 (Vortox)
 * 每晚选一名玩家：他死亡。镇民玩家的能力都会产生错误信息；若白天无人被处决，邪恶阵营立即获胜。
 */
export const vortox: RoleDefinition = {
  id: "vortox",
  name: "涡流",
  type: "demon",
  detailedDescription: `【背景故事】
"黑白颠倒，对错不再，左右变换，长短无猜。万物紊乱无可寻，短视死亡把命栽，何处寻答？随我来。"
【角色能力】
每个夜晚*，你要选择一名玩家：他死亡。
镇民玩家的能力都会产生错误信息。
如果白天没人被处决，邪恶阵营获胜。
【角色信息】
- 英文名：Vortox
- 所属剧本：梦殒春宵
- 角色类型：恶魔`,
  clarifications: [
    `相克规则：报丧女妖：如果恶魔杀死报丧女妖时涡流在场，玩家仍然会得知正确信息。（中文百科上的"通用简化原则"已涵盖包括多角色互动下的涡流信息的简化处理方式，此条仅做说明。）`,
  ],

  firstNight: {
    order: 2,

    target: {
      count: { min: 0, max: 0 },
    },

    dialog: (playerSeatId: number, _isFirstNight: boolean, context) => {
      return buildDemonFirstNightDialog(playerSeatId, "涡流", context);
    },

    handler: undefined,
  },

  night: {
    order: 7,

    target: {
      count: {
        min: 1,
        max: 1,
      },
    },

    dialog: (_playerSeatId: number, _isFirstNight: boolean, _context) => {
      return {
        wake: "⚔️ 选择一名玩家：他死亡。镇民玩家的能力都会产生错误信息，如果白天没人被处决，邪恶阵营获胜。",
        instruction:
          '"请选择一名玩家。他死亡。镇民玩家的能力都会产生错误信息，如果白天没人被处决，邪恶阵营获胜。"',
        close: "kill",
      };
    },

    handler: undefined /* TODO: Migrate to OOP */,
  },
};
