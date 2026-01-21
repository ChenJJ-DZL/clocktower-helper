import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 杂耍艺人 (Juggler)
 * 说明：每个白天，你都可以公开宣布你将发动杂耍艺人的能力，之后选择三名玩家：你死亡，且你所选择的三名玩家之中有一个恶魔。
 * 当前占位：已在 nightLogic 中实现。
 */
export const juggler: RoleDefinition = {
  id: "juggler",
  name: "杂耍艺人",
  type: "townsfolk",
};
