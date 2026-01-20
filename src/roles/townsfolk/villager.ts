import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 村夫 (Villager) - 扩展镇民（隐藏占位）
 *
 * 说明来源：josn/blood_clocktower_所有镇民.json
 * 目前仅加入角色库，不参与前台剧本选择，也不注入额外判定逻辑（避免影响现有流程）。
 */
export const villager: RoleDefinition = {
  id: "villager",
  name: "村夫",
  type: "townsfolk",
  night: {
    order: 0,
    target: { count: { min: 0, max: 0 } },
    dialog: () => ({
      wake: "",
      instruction: "",
      close: "",
    }),
    handler: () => ({
      updates: [],
      logs: {},
    }),
  },
};


