import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";
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
    `关于沙巴洛斯造成的反刍所带来的首夜能力使用时机的疑问：在这三个官方剧本中，角色详解通常只用于解决剧本内的一些互动方式，如果将角色互动拉到全角色和混合剧本的维度，则需要使用到统一的规则。在黯月初升中，因为只会至多有一名恶魔在场，并且爪牙发起攻击的情形不太常见，所以在大部分情况下，你可以让反刍的角色在沙巴洛斯的行动结束后立即行动。然而如果是混合剧本，则需要综合考虑，选择更准确的，不会出错的处理方式进行游戏的主持。`
  ],

  firstNight: {
    order: 2,

    target: {
      count: { min: 0, max: 0 },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean, context) => {
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

    dialog: (playerSeatId: number, isFirstNight: boolean, context) => {
      return {
        wake: "🐍 每个夜晚*，你要选择两名玩家：他们死亡。你上个夜晚选择过且当前死亡的玩家之一可能会被你反刍。",
        instruction: '"请选择两名玩家。他们死亡。上个夜晚选择过且当前死亡的玩家之一可能会被你反刍。"',
        close: "kill",
      };
    },

    handler: undefined, /* TODO: Migrate to OOP */

  },
};
