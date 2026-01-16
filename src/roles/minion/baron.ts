import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 男爵 (Baron)
 * Setup阶段增加2个外来者替换镇民（无夜晚行动）
 */
export const baron: RoleDefinition = {
  id: "baron",
  name: "男爵",
  type: "minion",
  // 无夜晚行动（Setup阶段能力）
};

