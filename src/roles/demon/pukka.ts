import type { Seat } from "../../types/game";
import type { RoleDefinition } from "../../types/roleDefinition";

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

  /**
   * ⚠️ 2026-10-24 修复（普卡首夜不下毒）：
   *   此处原先是**通用恶魔首夜**配置（`buildDemonFirstNightDialog` + 0 目标），
   *   与官方明写的「**不同于其他恶魔，普卡在首个夜晚就会行动**」矛盾
   *   （角色简介原文：「不同于其他恶魔，普卡在首个夜晚就会行动」）。
   *   ⇒ 首夜必须与其它夜**同样**执行「选择一名玩家：他中毒」，
   *     否则首夜能力节点渲染出的是「恶魔互认」文案、目标数为 0，说书人无从下毒。
   */
  firstNight: {
    order: 6,

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
  },
};
