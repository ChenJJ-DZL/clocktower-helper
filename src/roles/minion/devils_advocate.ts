import type { Seat } from "../../../app/data";

import type { RoleDefinition } from "../../types/roleDefinition";

/**
 * 魔鬼代言人
 */
export const devils_advocate: RoleDefinition = {
  id: "devils_advocate",
  name: "魔鬼代言人",
  type: "minion",
  detailedDescription: `【背景故事】
"如果异议被驳回，我的委托人将进行无罪申辩，理由是控方不遵守法规第27章B条——针对动词进行非正确或误导性的词形变化。昨晚有九名陪审团成员死亡，这个事实只不过是表面证据，正如威尔斯诉图勒案所开创的先例，这是无罪释放的进一步理由。"
【角色能力】
每个夜晚，你要选择一名存活的玩家（与上个夜晚不同）：如果明天白天他被处决，他不会死亡。
【角色信息】
- 英文名：Devil's Advocate
- 所属剧本：黯月初升
- 角色类型：爪牙`,

  night: {
    order: (isFirstNight) => (isFirstNight ? 5 : 5),

    target: {
      count: {
        min: 1,
        max: 1,
      },
    },

    dialog: (playerSeatId: number, _isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（魔鬼代言人）。`,
        instruction: "请执行行动",
        close: "",
      };
    },

  },
};
