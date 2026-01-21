import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 共情者 (Empath)
 * 说明：每个夜晚，你会得知与你邻近的两名存活的玩家中邪恶玩家的数量。
 * 当前占位：已在 nightLogic 中实现。
 */
export const empath: RoleDefinition = {
  id: "empath",
  name: "共情者",
  type: "townsfolk",
};
