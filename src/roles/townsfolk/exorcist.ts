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
};
