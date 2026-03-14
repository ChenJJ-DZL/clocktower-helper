import type { RoleDefinition } from "../../types/roleDefinition";
import { buildDemonFirstNightDialog } from "./demonFirstNightHelper";

/**
 * 哈迪寂亚
 * 每个夜晚*，选择三名玩家（所有玩家都会得知你选了谁）：他们秘密决定自己的命运。
 */
export const hadesia: RoleDefinition = {
  id: "hadesia",
  name: "哈迪寂亚",
  type: "demon",
  detailedDescription: `【背景故事】
"沉默是金。"（阿拉伯语）
【角色能力】
每个夜晚*，你可以选择三名玩家（所有玩家都会得知你选了谁）：他们分别秘密决定自己的生死，然后如果他们都存活则都死亡。
【角色信息】
- 英文名：Al-Hadikhia
- 所属剧本：实验性角色、梦殒春宵卡牌版
- 角色类型：恶魔`,
  clarifications: [
    `已死亡的玩家如果选择"活着"，会被复活。`,
    `"如果他们都存活"判断条件不会关注这些玩家是如何做出选择的，而只看在这些选择结算后玩家是否存活。选择"死去"的存活玩家如果受到免死能力的保护，会因此存活并计入"如果他们都存活"的判断条件。`,
    "如果哈迪寂亚醉酒或中毒，他在使用自己的能力时不会产生任何效果。",
    "相克规则：红唇女郎：如果出现两名存活的哈迪寂亚，则红唇女郎变成的哈迪寂亚会变回红唇女郎。主谋：如果哈迪寂亚死于处决，且主谋存活，当晚哈迪寂亚要选择三名善良玩家：如果他们都选择存活，邪恶阵营获胜。否则，善良阵营获胜。公主：如果公主在首个白天提名并处决了一名玩家，没有人会因为哈迪寂亚的能力而死亡。",
  ],

  firstNight: {
    order: 2,

    target: {
      count: { min: 0, max: 0 },
    },

    dialog: (playerSeatId: number, _isFirstNight: boolean, context) => {
      return buildDemonFirstNightDialog(playerSeatId, "哈迪寂亚", context);
    },

    handler: undefined,
  },

  night: {
    order: 4,

    target: {
      count: {
        min: 0,
        max: 3,
      },
    },

    dialog: (_playerSeatId: number, _isFirstNight: boolean, _context) => {
      return {
        wake: "⚔️ 选择三名玩家（所有玩家都会得知你选择了谁）：他们秘密决定自己的命运，如果他们全部存活，他们全部死亡。",
        instruction:
          '"请选择三名玩家。所有玩家都会得知你选择了谁。他们秘密决定自己的命运，如果他们全部存活，他们全部死亡。"',
        close: "kill",
      };
    },

    handler: undefined /* TODO: Migrate to OOP */,
  },
};
