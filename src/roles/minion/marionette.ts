import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 提线木偶 (Marionette)
 * 你看起来像镇民/外来者，但实际是爪牙；恶魔知道你是谁。
 *
 * 规则要点（占位，未实现逻辑）：
 * - 你视为爪牙，阵营为邪恶，但你自己以为是镇民/外来者
 * - 恶魔得知你是提线木偶
 * - 你邻座的一名镇民/外来者可能被当作邪恶（需讲故事人裁定）
 *
 * 当前状态：hidden 占位，未接管夜晚行动与判定逻辑。
 */
export const marionette: RoleDefinition = {
  id: "marionette",
  name: "提线木偶",
  type: "minion",
  // 无夜晚行动（认知覆盖型，被动伪装），具体逻辑待实现
};


