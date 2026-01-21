import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 送葬者 (Undertaker)
 * 说明：每个夜晚*，你会得知今天白天死于处决的玩家的角色。
 * 当前占位：已在 nightLogic 中实现。
 */
export const undertaker: RoleDefinition = {
  id: "undertaker",
  name: "送葬者",
  type: "townsfolk",
};
