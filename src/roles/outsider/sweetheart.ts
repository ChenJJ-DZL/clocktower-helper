import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 心上人 (Sweetheart)
 * 当你死亡时，会有一名玩家开始醉酒。
 * 
 * 规则要点：
 * - 由说书人选择哪名玩家醉酒
 * - 这项能力当心上人死亡时才会被触发
 * - 醉酒效果在剩余的游戏时间里持续生效
 * - 如果心上人在死亡时醉酒中毒，说书人不会获得爪牙能力
 */
export const sweetheart: RoleDefinition = {
  id: "sweetheart",
  name: "心上人",
  type: "outsider",
  // 无夜晚行动（死亡触发能力）
  // 心上人的能力在死亡时触发，由说书人选择目标玩家醉酒
};
