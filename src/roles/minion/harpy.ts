import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 鹰身女妖 (Harpy)
 * 每夜选择两名玩家：第 1 名需在白天公开说第 2 名是爪牙，否则你们之一会死亡。
 *
 * 规则要点（占位，未实现逻辑）：
 * - 夜晚选择 A、B；白天 A 需公开宣称 B 为爪牙
 * - 若未宣称或违反条件，可能导致 A 或 B 死亡（由说书人裁定）
 *
 * 当前状态：hidden 占位，未实现夜晚选择与白天检查逻辑。
 */
export const harpy: RoleDefinition = {
  id: "harpy",
  name: "鹰身女妖",
  type: "minion",
  // 夜选+白天公开声明，具体逻辑待实现
};


