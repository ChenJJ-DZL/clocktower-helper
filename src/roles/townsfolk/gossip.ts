import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 造谣者
 * TODO: 添加角色描述
 */
export const gossip: RoleDefinition = {
  id: "gossip",
  name: "造谣者",
  type: "townsfolk",
  night: {
    order: 21,
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    dialog: (playerSeatId: number) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（造谣者）。`,
        instruction: "请造一个关于镇上的传闻，说书人会记录并判断其是否为真。如果为真，则今晚会多死一人（说书人选择目标）。",
        close: `${playerSeatId + 1}号玩家（造谣者），请闭眼。`,
      };
    },
    handler: (context) => {
      return {
        updates: [],
        logs: {
          privateLog: `造谣者（${context.selfId + 1}号）本夜造谣：由说书人线下记录内容，并在需要时手动触发“造谣成真额外死亡”。`,
        },
      };
    },
  },
};
