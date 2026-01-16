import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 酒鬼 (Drunk)
 * 误以为自己是镇民，实际是酒鬼（首夜与其他夜晚行动）
 * 注意：酒鬼的实际夜晚行动由其 charadeRole（镇民角色）决定
 */
export const drunk: RoleDefinition = {
  id: "drunk",
  name: "酒鬼",
  type: "outsider",
  // 酒鬼的夜晚行动由其 charadeRole 决定，这里不需要定义
  // 在 getNightWakeQueue 中会特殊处理
};

