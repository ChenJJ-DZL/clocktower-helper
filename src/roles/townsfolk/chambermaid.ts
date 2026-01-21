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
};
