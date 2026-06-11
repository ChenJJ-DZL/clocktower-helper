import type {
  DayActionContext,
  DayActionResult,
  NightActionContext,
  NightActionResult,
  RoleDefinition,
} from "../../types/roleDefinition";

/**
 * 造谣者 (Gossip)
 * 说明：每个白天，你可以公开发表一个声明。如果该声明正确，在当晚会有一名玩家死亡。
 */
export const gossip: RoleDefinition = {
  id: "gossip",
  name: "造谣者",
  type: "townsfolk",
  detailedDescription: `【背景故事】
“巴拉巴拉巴拉巴拉巴拉巴拉巴拉巴拉巴拉巴拉巴拉巴拉巴拉巴拉巴拉巴拉巴拉巴拉巴拉巴拉巴拉巴拉巴拉巴拉巴拉。巴拉。”
【角色能力】
每个白天，你可以公开发表一个声明。如果该声明正确，在当晚会有一名玩家死亡。
【运作方式】
每个白天，造谣者可以发表传闻。
每个夜晚（除首夜外），如果传闻为真，说书人选择一名玩家死亡。
【角色信息】
- 英文名：Gossip
- 所属剧本：黯月初升
- 角色类型：镇民`,

  night: {
    order: 21,
    target: {
      count: { min: 0, max: 0 },
    },
    dialog: (playerSeatId: number) => ({
      wake: `唤醒${playerSeatId + 1}号玩家（造谣者）。`,
      instruction:
        "如果该玩家今日发表了正确的传闻，说书人应选择一名玩家额外死亡。",
      close: "",
    }),
  },
};
