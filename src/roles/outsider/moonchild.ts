import { RoleDefinition, ExecutionContext, ExecutionResult } from "../../types/roleDefinition";

/**
 * 月之子 (Moonchild)
 * 当你得知你死亡时，你要公开选择一名存活的玩家。如果他是善良的，在当晚他会死亡。
 * 
 * 规则要点：
 * - 月之子必须在得知自己死亡后的一到两分钟内选择一名玩家
 * - 如果选择善良玩家，该玩家会在当晚死亡
 * - 如果选择邪恶玩家，无事发生
 * - 在选择时，月之子是否醉酒中毒不重要，重要的是所选玩家是否善良
 */
export const moonchild: RoleDefinition = {
  id: "moonchild",
  name: "月之子",
  type: "outsider",
  // 无夜晚行动（死亡触发能力）
  // 月之子的能力在死亡时触发，需要通过弹窗让玩家选择目标
};
