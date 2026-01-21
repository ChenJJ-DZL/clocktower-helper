import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 猎手 (Slayer)
 * 说明：每局游戏限一次，你可以在白天时公开选择一名玩家：如果他是恶魔，他死亡。
 * 当前占位：已在 nightLogic 中实现。
 */
export const slayer: RoleDefinition = {
  id: "slayer",
  name: "猎手",
  type: "townsfolk",
};
