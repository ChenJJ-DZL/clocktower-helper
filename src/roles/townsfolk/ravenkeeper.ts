import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 守鸦人 (Ravenkeeper)
 * 说明：如果你在夜晚死亡，你会被唤醒，然后你要选择一名玩家：你会得知他的角色。
 * 当前占位：已在 nightLogic 中实现。
 */
export const ravenkeeper: RoleDefinition = {
  id: "ravenkeeper",
  name: "守鸦人",
  type: "townsfolk",
};
