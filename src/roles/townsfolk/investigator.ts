import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 调查员 (Investigator)
 * 说明：首夜得知一名爪牙的具体身份。
 * 当前占位：已在 nightLogic 中实现。
 */
export const investigator: RoleDefinition = {
  id: "investigator",
  name: "调查员",
  type: "townsfolk",
};
