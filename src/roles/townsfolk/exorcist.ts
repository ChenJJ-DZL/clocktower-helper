import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 驱魔人 (Exorcist)
 * 说明：每个夜晚*，你要选择一名存活的玩家：恶魔的负面能力对该玩家无效。
 * 当前占位：已在 nightLogic 中实现。
 */
export const exorcist: RoleDefinition = {
  id: "exorcist",
  name: "驱魔人",
  type: "townsfolk",
  night: {
    order: 10,
    target: {
      count: { min: 1, max: 1 },
      canSelect: (target, self) => target.id !== self.id && !target.isDead,
    },
    dialog: (playerSeatId) => ({
      wake: `唤醒${playerSeatId + 1}号玩家（驱魔人）。`,
      instruction: "选择一名除你以外的存活玩家。",
      close: `${playerSeatId + 1}号玩家（驱魔人），请闭眼。`,
    }),
    handler: (context) => ({
      updates: [],
      logs: { privateLog: `驱魔人（${context.selfId + 1}号）选择了${context.targets[0] + 1}号玩家` },
    }),
  },
};
