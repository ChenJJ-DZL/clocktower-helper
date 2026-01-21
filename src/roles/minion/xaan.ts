import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 限 (Xaan)
 * 在“等同于初始外来者数量”的夜晚，所有镇民中毒直到下个黄昏；且外来者数量可被调整（覆盖部分设置调整）。
 *
 * 说明：
 * - 涉及“初始外来者数量记录”“第N夜触发的全体状态”“设置调整覆盖”，属于系统级扩展。
 * - 先加入角色库（hidden），不改变现有逻辑与 UI。
 */
export const xaan: RoleDefinition = {
  id: "xaan",
  name: "限",
  type: "minion",
};



