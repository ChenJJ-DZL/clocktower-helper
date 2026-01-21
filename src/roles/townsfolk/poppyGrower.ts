import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 和事佬 (Poppy Grower)
 * 说明：如果只有三名玩家存活，且你被恶魔杀死，则直到下一个黄昏所有玩家都可能会被视为恶魔，且恶魔的负面能力对所有玩家无效。
 * 当前占位：已在 nightLogic 中实现。
 */
export const poppy_grower: RoleDefinition = {
  id: "poppy_grower",
  name: "和事佬",
  type: "townsfolk",
};

