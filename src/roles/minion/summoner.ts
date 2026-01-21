import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 召唤师 (Summoner)
 * 首夜得知 3 个伪装；第 3 夜选择一名玩家，使其变成你指定的恶魔。
 *
 * 规则要点（占位，未实现逻辑）：
 * - 首夜提供额外伪装信息
 * - 第三夜（或当晚）可将一名玩家变为恶魔角色（需选择恶魔类型）
 * - 若无恶魔可选或受阻，则说书人按规则裁定
 *
 * 当前状态：hidden 占位，未实现首夜信息与第三夜变恶魔的逻辑。
 */
export const summoner: RoleDefinition = {
  id: "summoner",
  name: "召唤师",
  type: "minion",
  // 首夜信息 + 第三夜角色变换，具体逻辑待实现
};


