import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 莽夫 (Goon)
 * 每个夜晚，首个使用其自身能力选择了你的玩家会醉酒直到下个黄昏。你会转变为他的阵营。
 * 
 * 规则要点：
 * - 每个夜晚，首个选择莽夫的玩家会立即醉酒
 * - 莽夫会转变为该玩家的阵营
 * - 如果是刺客选择莽夫，莽夫会死亡但仍然转变为邪恶阵营
 * - 被祖母等由说书人选择的不算在内
 */
export const goon: RoleDefinition = {
  id: "goon",
  name: "莽夫",
  type: "outsider",
  // 无夜晚行动（被动触发能力）
  // 莽夫的能力在夜晚被其他角色选择时被动触发
  // 具体逻辑在 useGameController 或相关处理函数中实现
};
