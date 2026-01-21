import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 厨师 (Chef)
 * 说明：首夜得知有多少对邪恶玩家相邻。
 * 当前占位：已在 nightLogic 中实现。
 */
export const chef: RoleDefinition = {
  id: "chef",
  name: "厨师",
  type: "townsfolk",
};
