import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 畸形秀演员 (Mutant)
 * 如果你"疯狂"地证明自己是外来者，你可能被处决。
 * 
 * 规则要点：
 * - "疯狂"指试图说服他人相信某件事情
 * - 如果畸形秀演员试图证明自己是外来者，说书人可以处决他
 * - 可以在任何时间处决，包括夜晚
 * - 如果在白天常规处决前被处决，则当天不能再有处决
 */
export const mutant: RoleDefinition = {
  id: "mutant",
  name: "畸形秀演员",
  type: "outsider",
  // 无夜晚行动（被动触发能力）
  // 畸形秀演员的能力在玩家"疯狂"证明自己是外来者时触发
  // 具体由说书人判断并手动触发处决
};
