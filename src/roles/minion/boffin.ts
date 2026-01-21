import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 科学怪人 (Boffin)
 * 恶魔获得一个不在场善良角色的能力（即使恶魔醉酒/中毒）；你与恶魔都知道获得了什么能力。
 *
 * 说明：
 * - 该能力涉及“恶魔额外能力/额外唤醒/设置调整”，属于系统级扩展。
 * - 先加入角色库（hidden），不改变现有逻辑与 UI。
 */
export const boffin: RoleDefinition = {
  id: "boffin",
  name: "科学怪人",
  type: "minion",
};



