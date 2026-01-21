import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 炸弹人 (Boomdandy)
 * 如果你被处决，除三名玩家外的其他人都会死亡；随后按指向决定再死一名。
 *
 * 规则要点（占位，未实现逻辑）：
 * - 被处决时触发群体死亡效果，通常保留3名存活
 * - 10秒指向阶段后，最多指向者死亡（需要主持人手动）
 *
 * 当前状态：hidden 占位，未实现处决触发及指向结算逻辑。
 */
export const boomdandy: RoleDefinition = {
  id: "boomdandy",
  name: "炸弹人",
  type: "minion",
  // 处决触发群体死亡，具体结算逻辑待实现
};


