import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 矿工 (Miner)
 * 说明：每个夜晚*，你要选择一名玩家：你会被唤醒并得知他的角色，如果他是酒鬼、投毒者或恶魔，你也会醉酒。
 * 当前占位：已在 nightLogic 中实现。
 */
export const miner: RoleDefinition = {
  id: "miner",
  name: "矿工",
  type: "townsfolk",
};

