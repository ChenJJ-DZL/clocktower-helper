import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 陌客 (Recluse)
 * 判定阵营时可能被视为邪恶/爪牙/恶魔（无夜晚行动）
 */
export const recluse: RoleDefinition = {
  id: "recluse",
  name: "陌客",
  type: "outsider",
  // 无夜晚行动（被动能力）
};

