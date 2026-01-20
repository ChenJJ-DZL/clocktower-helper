import { RoleDefinition, NightActionContext, NightActionResult } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 教父
 * TODO: 添加角色描述
 */
export const godfather: RoleDefinition = {
  id: "godfather",
  name: "教父",
  type: "minion",
  // 教父的夜晚具体逻辑在 nightLogic 中由 trigger 条件驱动，这里只保留占位，
  // 避免与 nightLogic 中的引导/顺序重复定义。
};
