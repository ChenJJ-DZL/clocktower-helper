import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 吟游诗人 (Bard)
 * 说明：你的能力只有在没有吟游诗人在场时才能生效。每个夜晚*，你的一名存活的邻座玩家不会死亡。
 * 当前占位：已在 nightLogic 中实现。
 */
export const bard: RoleDefinition = {
  id: "bard",
  name: "吟游诗人",
  type: "townsfolk",
};

