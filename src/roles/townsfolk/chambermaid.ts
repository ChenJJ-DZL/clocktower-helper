import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 侍女 (Chambermaid)
 * 说明：每个夜晚，你要选择除你以外的两名存活的玩家：你会得知他们中有几人在当晚因其自身能力而被唤醒。
 * 当前占位：已在 nightLogic 中实现。
 */
export const chambermaid: RoleDefinition = {
  id: "chambermaid",
  name: "侍女",
  type: "townsfolk",
  night: {
    order: 51,
    target: {
      count: { min: 2, max: 2 },
      canSelect: (target, self) => target.id !== self.id && !target.isDead,
    },
    dialog: (playerSeatId) => ({
      wake: `唤醒${playerSeatId + 1}号玩家（侍女）。`,
      instruction: "选择两名除你以外的存活玩家。",
      close: `${playerSeatId + 1}号玩家（侍女），请闭眼。`,
    }),
    handler: (context) => ({
      updates: [],
      logs: { privateLog: `侍女（${context.selfId + 1}号）查验了${context.targets.map(t => t + 1).join('、')}号玩家` },
    }),
  },
};
