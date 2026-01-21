import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 圣徒 (Saint)
 * 说明：如果你因被提名而死亡，游戏结束且善良阵营获胜。
 * 当前占位：已在 nightLogic 中实现。
 */
export const saint_townsfolk: RoleDefinition = {
  id: "saint_townsfolk",
  name: "圣徒",
  type: "townsfolk",
};

