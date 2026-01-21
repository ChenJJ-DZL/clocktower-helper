import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 僧侣 (Monk)
 * 说明：每个夜晚*，你要选择除你以外的一名玩家：当晚恶魔的负面能力对他无效。
 * 当前占位：已在 nightLogic 中实现。
 */
export const monk: RoleDefinition = {
  id: "monk",
  name: "僧侣",
  type: "townsfolk",
};
