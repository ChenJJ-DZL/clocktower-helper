import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 圣徒 (Saint)
 * 若死于处决，邪恶方立即获胜（无夜晚行动）
 */
export const saint: RoleDefinition = {
  id: "saint",
  name: "圣徒",
  type: "outsider",
  // 无夜晚行动（被动能力）
};

