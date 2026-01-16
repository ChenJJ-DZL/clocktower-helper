import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 猎手 (Slayer)
 * 白天可指定一名玩家，若为恶魔，恶魔死（无夜晚行动）
 */
export const slayer: RoleDefinition = {
  id: "slayer",
  name: "猎手",
  type: "townsfolk",
  // 无夜晚行动（白天能力）
};

