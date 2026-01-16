import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 士兵 (Soldier)
 * 被恶魔攻击时不会死亡（无夜晚行动）
 */
export const soldier: RoleDefinition = {
  id: "soldier",
  name: "士兵",
  type: "townsfolk",
  // 无夜晚行动（被动能力）
};

