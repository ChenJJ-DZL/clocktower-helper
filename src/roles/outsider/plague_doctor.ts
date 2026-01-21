import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 瘟疫医生 (Plague Doctor)
 * 当你死亡时，说书人会获得一个爪牙能力。
 * 
 * 规则要点：
 * - 由说书人来选择获得哪一个爪牙的能力
 * - 瘟疫医生的能力效果会在剩余的游戏时间里持续生效
 * - 说书人不会有其他变化——他不会转为邪恶阵营，不会成为玩家，不会成为其他能力的合法目标，不能参与投票，也不能发起提名
 * - 如果瘟疫医生在死亡时醉酒中毒，说书人不会获得爪牙能力，即使瘟疫医生在之后恢复清醒健康
 */
export const plague_doctor: RoleDefinition = {
  id: "plague_doctor",
  name: "瘟疫医生",
  type: "outsider",
  // 无夜晚行动（死亡触发能力）
  // 瘟疫医生的能力在死亡时触发，由说书人选择获得一个爪牙能力
};


