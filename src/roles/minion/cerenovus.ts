import type { RoleDefinition } from "../../types/roleDefinition";
import { buildDemonFirstNightDialog } from "../demon/demonFirstNightHelper";

/**
 * 塞壬
 * 每个夜晚*，选择一名玩家与一个角色：他得知自己是该角色，且必须如此扮演。
 */
export const cerenovus: RoleDefinition = {
  id: "cerenovus",
  name: "洗脑师",
  type: "minion",
  detailedDescription: `【背景故事】
"我亲爱的，你看起来如此疲惫。来，让我为你唱一首摇篮曲，让你好好休息。"
【角色能力】
每个夜晚*，你可以选择一名玩家与一个角色：他得知自己是该角色，且必须如此扮演。
【角色信息】
- 英文名：Cerenovus
- 所属剧本：梦殒春宵
- 角色类型：爪牙`,

  firstNight: {
    order: 25,

    target: {
      count: { min: 1, max: 1 },
    },

    dialog: (_playerSeatId: number, _isFirstNight: boolean, _context) => {
      return {
        // ⚠️ 2026-09-13：原文案只写「一个角色」，**丢失了"善良角色"这一硬约束**
        //    （可能被理解成可选爪牙/恶魔）。官方三处均为「一个**善良角色**」：
        //      · 角色能力：「你要选择一名玩家和一个善良角色」
        //      · 角色简介：「让一名玩家'疯狂'地证明自己是某个**镇民或外来者**角色」
        //      · nightOrder 条目：「让他选择一名玩家和角色列表上的**一个善良角色**」
        wake: "🎭 每个夜晚，你可以选择一名玩家和一个善良角色（镇民或外来者）：他得知自己是该角色，且必须如此扮演。",
        instruction:
          '"请选择一名玩家和一个善良角色（镇民或外来者）。他得知自己是该角色，且必须如此扮演。"',
        close: "madness",
      };
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
        // ⚠️ 2026-09-13 两处修正：
        //   1) 原文案是「每个夜晚*」——`*` 是官方夜序表「首夜除外」的规则记号，
        //      不该出现在引导里；且 firstNight 分支写的是无星号的「每个夜晚」，
        //      同一角色两套表述自相矛盾。官方文本亦为「每个夜晚」无星号 → 去掉 `*`。
        //   2) 原文案只写「一个角色」，丢失了「**善良**角色」硬约束
        //（官方能力/简介/nightOrder 条目三处均为「一个善良角色（镇民或外来者）」）。
        wake: "🎭 每个夜晚，你可以选择一名玩家和一个善良角色（镇民或外来者）：他得知自己是该角色，且必须如此扮演。",
        instruction:
          '"请选择一名玩家和一个善良角色（镇民或外来者）。他得知自己是该角色，且必须如此扮演。"',
        close: "madness",
      };
    },
  },

  day: {
    name: "疯狂洗脑",
    maxUses: 1,
    target: {
      min: 0,
      max: 0,
    },
  },
};

