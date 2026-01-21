import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 贤者 (Sage)
 * 说明：如果你因恶魔的能力而死亡，你会被唤醒，然后你要选择三名玩家：其中一名是恶魔。
 * 当前占位：已在 nightLogic 中实现。
 */
export const sage: RoleDefinition = {
  id: "sage",
  name: "贤者",
  type: "townsfolk",
};
