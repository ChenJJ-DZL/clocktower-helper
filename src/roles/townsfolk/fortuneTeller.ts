import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 占卜师 (Fortune Teller)
 * 说明：每个夜晚，你要选择两名玩家：你会得知他们之中是否有恶魔。会有一名善良玩家始终被你的能力当作恶魔。
 * 当前占位：已在 nightLogic 中实现。
 */
export const fortune_teller: RoleDefinition = {
  id: "fortune_teller",
  name: "占卜师",
  type: "townsfolk",
};

