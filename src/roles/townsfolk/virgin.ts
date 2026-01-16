import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 贞洁者 (Virgin)
 * 首次被镇民提名的瞬间，提名者被处决（无夜晚行动）
 */
export const virgin: RoleDefinition = {
  id: "virgin",
  name: "贞洁者",
  type: "townsfolk",
  // 无夜晚行动
};

