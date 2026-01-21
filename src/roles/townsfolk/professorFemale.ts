import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 教授 (Professor - Female)
 * 说明：每局游戏限一次，你可以在夜晚选择一名已死亡的善良玩家：他立刻复活。
 * 当前占位：已在 nightLogic 中实现。
 */
export const professor_female: RoleDefinition = {
  id: "professor_female",
  name: "教授（女）",
  type: "townsfolk",
};

