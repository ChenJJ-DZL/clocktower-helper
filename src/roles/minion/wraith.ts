import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 亡魂 (Wraith)
 * 你可以在夜晚窥视，常与“在夜晚躺下”相关的观察能力。
 *
 * 规则要点（占位，未实现逻辑）：
 * - 夜晚可以选择是否“起身/旁观”，以得知当晚发生的部分情况
 * - 若你被其他能力选中，仍然可能被杀/处决
 *
 * 当前状态：hidden 占位，未实现夜晚观察逻辑。
 */
export const wraith: RoleDefinition = {
  id: "wraith",
  name: "亡魂",
  type: "minion",
  // 夜晚旁观型能力，具体逻辑待实现
};


