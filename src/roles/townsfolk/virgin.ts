import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 贞洁者 (Virgin)
 * 说明：当你首次被提名时，如果提名你的玩家是镇民，他立刻被处决。
 * 当前占位：已在 nightLogic 中实现。
 */
export const virgin: RoleDefinition = {
  id: "virgin",
  name: "贞洁者",
  type: "townsfolk",
};
