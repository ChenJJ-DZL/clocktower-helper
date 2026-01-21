import { RoleDefinition, ExecutionContext, ExecutionResult } from "../../types/roleDefinition";

/**
 * 呆瓜 (Klutz)
 * 当你得知你死亡时，你要公开选择一名存活的玩家：如果他是邪恶的，你的阵营落败。
 * 
 * 规则要点：
 * - 呆瓜死亡时必须公开选择一名玩家
 * - 如果选择邪恶玩家，游戏立即结束，善良阵营落败
 * - 如果选择善良玩家，无事发生，游戏继续
 * - 说书人没有义务提醒呆瓜，但新手玩家可能不清楚规则
 */
export const klutz: RoleDefinition = {
  id: "klutz",
  name: "呆瓜",
  type: "outsider",
  // 无夜晚行动（死亡触发能力）
  // 呆瓜的能力在死亡时触发，需要通过弹窗让玩家选择目标
};
