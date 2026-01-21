import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 星象师 (Astrologer)
 * 说明：每个夜晚*，你要选择一名玩家：你会得知一个其所没有的善良角色。每局游戏限一次，你可以选择不使用能力。
 * 当前占位：已在 nightLogic 中实现。
 */
export const astrologer: RoleDefinition = {
  id: "astrologer",
  name: "星象师",
  type: "townsfolk",
};

