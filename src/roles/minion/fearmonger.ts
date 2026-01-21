import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 恐惧之灵 (Fearmonger)
 * 每晚选择一名玩家；若你提名该玩家且其被处决，则该玩家阵营落败。
 * 首次选择/更换目标时，全体会得知“恐惧之灵选择了新的玩家”（不告知是谁）。
 *
 * 说明：
 * - 涉及提名/处决的胜负判定与全局广播提示，先占位加入角色库，避免影响现有胜负逻辑。
 */
export const fearmonger: RoleDefinition = {
  id: "fearmonger",
  name: "恐惧之灵",
  type: "minion",
};



