import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 维齐尔 (Vizier)
 * 所有人都知道维齐尔在场；你通常不怕提名，可能影响投票/处决。
 *
 * 规则要点（占位，未实现逻辑）：
 * - 维齐尔公开存在，可能在特定条件下免疫提名或改写投票
 * - 需要根据完整规则补充提名/投票的特殊处理
 *
 * 当前状态：hidden 占位，未实现提名/投票改写逻辑。
 */
export const vizier: RoleDefinition = {
  id: "vizier",
  name: "维齐尔",
  type: "minion",
  // 投票/提名改写型，具体逻辑待实现
};


