import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 修补匠 (Tinker)
 * 你随时可能死亡。
 * 
 * 规则要点：
 * - 说书人随时可以杀死修补匠，不需要任何理由
 * - 修补匠在受到免于死亡的能力保护时，不能因自己的能力而死亡
 * - 可以在白天或夜晚死亡
 * - 如果在夜晚死亡，在黎明宣布死亡玩家时告知
 */
export const tinker: RoleDefinition = {
  id: "tinker",
  name: "修补匠",
  type: "outsider",
  // 无夜晚行动（被动触发能力）
  // 修补匠的死亡由说书人随时手动触发
  // 具体逻辑在说书人控制面板中实现
};
