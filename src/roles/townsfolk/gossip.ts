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

  day: {
    name: "发表传闻",
    maxUses: "infinity",
    target: { min: 0, max: 0 },
    handler: (context: DayActionContext): DayActionResult => {
      return {
        updates: [
          {
            id: context.selfId,
            statusDetails: [
              ...(context.seats[context.selfId].statusDetails || []),
              "今日已造谣",
            ],
          },
        ],
        logs: {
          publicLog: `🗣️ ${context.selfId + 1}号 [造谣者] 发表了一个公开传闻。`,
          privateLog: `造谣者（${context.selfId + 1}号）已发表传闻，请说书人记下内容并判断真伪。`,
        },
      };
    },
  },

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
    handler: (context: NightActionContext): NightActionResult | null => {
      const { seats, selfId, gamePhase } = context;
      if (gamePhase === "firstNight") return { updates: [] };

      const selfSeat = seats.find((s) => s.id === selfId);

      return {
        updates: [
          {
            id: selfId,
            statusDetails: (selfSeat?.statusDetails || []).filter(
              (d) => d !== "今日已造谣"
            ),
          },
        ],
        modal: {
          type: "STORYTELLER_SELECT",
          data: {
            sourceId: selfId,
            roleId: "gossip",
            roleName: "造谣者",
            description:
              "如果该玩家今日造谣为【真】，请选择一名玩家死亡（额外死亡）。否则直接取消。",
            targetCount: 1,
            onConfirm: (_targetIds: number[]) => {},
          },
        },
        logs: {
          privateLog: `造谣者（${selfId + 1}号）行动中，请判定真伪并处理额外死亡。`,
        },
      };
    },
  },
};
