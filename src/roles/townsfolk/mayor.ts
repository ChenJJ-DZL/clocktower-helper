import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 市长 (Mayor)
 * 若仅剩3人且无人被处决，好人获胜（无夜晚行动）
 */
export const mayor: RoleDefinition = {
  id: "mayor",
  name: "镇长",
  type: "townsfolk",
  // 无夜晚行动（被动能力）
};

