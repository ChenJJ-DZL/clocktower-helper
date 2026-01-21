import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 巫师 (Wizard)
 * 每局限一次：向说书人许愿；愿望可能实现，并伴随代价/线索。
 *
 * 说明：
 * - 该能力高度依赖说书人裁定与自定义效果，属于“说书人工具/事件系统”范畴。
 * - 先加入角色库（hidden），不改变现有逻辑与 UI。
 */
export const wizard: RoleDefinition = {
  id: "wizard",
  name: "巫师",
  type: "minion",
};



