import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 赌徒
 * TODO: 添加角色描述
 */
export const gambler: RoleDefinition = {
  id: "gambler",
  name: "赌徒",
  type: "townsfolk",
  
  // 赌徒的具体夜晚结算逻辑由 nightLogic + 说书人手动裁定（通过 UI 记录猜测与结果）完成
  // 这里不实现自动判定，只保留角色元数据（夜序等）在 rolesData.json 中配置
};
