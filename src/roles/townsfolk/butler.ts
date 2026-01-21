import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 告密者 (Butler)
 * 说明：每个夜晚*，你要选择一名存活的玩家：第二天白天时你必须提名他。
 * 当前占位：已在 nightLogic 中实现。
 */
export const butler: RoleDefinition = {
  id: "butler",
  name: "告密者",
  type: "townsfolk",
};

