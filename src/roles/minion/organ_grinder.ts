import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 街头风琴手 (Organ Grinder)
 * 所有玩家投票闭眼、秘密计票；每晚可选择自己是否醉酒到下个黄昏（醉酒则投票恢复正常公开）。
 *
 * 说明：
 * - 本角色会影响“投票 UI/计票流程”，属于较大改动。此处先加入角色库，占位不改变现有投票逻辑。
 * - 夜晚“选择是否醉酒”也先用提示/占位处理，避免影响现有判定。
 */
export const organ_grinder: RoleDefinition = {
  id: "organ_grinder",
  name: "街头风琴手",
  type: "minion",
};



