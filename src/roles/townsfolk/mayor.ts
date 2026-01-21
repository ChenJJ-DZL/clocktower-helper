import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 镇长 (Mayor)
 * 说明：如果只有三名玩家存活且白天没有人被处决，你的阵营获胜。如果你在夜晚即将死亡，可能会有一名其他玩家代替你死亡。
 * 当前占位：已在 nightLogic 中实现。
 */
export const mayor: RoleDefinition = {
  id: "mayor",
  name: "镇长",
  type: "townsfolk",
};
