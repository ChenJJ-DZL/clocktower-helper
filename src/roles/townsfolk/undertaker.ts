import type { RoleDefinition } from "../../types/roleDefinition";

/**
 * 送葬者 (Undertaker)
 * 说明：每个夜晚*，你会得知今天白天死于处决的玩家的角色。
 * 当前占位：已在 nightLogic 中实现。
 */
export const undertaker: RoleDefinition = {
  id: "undertaker",
  name: "送葬者",
  type: "townsfolk",
  detailedDescription:
    "每个夜晚*，你会得知今天白天死于处决的玩家的角色。\n\n**运作方式:**\n除首个夜晚以外的每个夜晚，如果当天有任何玩家死于处决，唤醒送葬者。向他展示被标记了“死于今日”的角色标记。让送葬者重新入睡。\n\n**提示与技巧:**\n- 被处决的玩家越多，你得到的信息就越多。尽可能多地促成处决将让你获益匪浅。\n- 你不会得知旅行者的角色。他们会因为流放而死亡，但不会因为处决而死亡。\n- 早期比较适合的被处决的人选是像洗衣妇和图书管理员之类的角色，因为你在确认了他们角色的同时也证实了其他善良阵营玩家的角色。\n- 如果被处决的玩家是酒鬼，你将会看到酒鬼的角色标记，而不是他以为的镇民角色的标记。\n- 当心间谍和陌客！他们有可能相应地被你当做善良角色和邪恶角色，因为他们的能力在他们死后也依然生效。",
  clarifications: [
    "如果白天无人被处决，或发生了处决但无人死亡，送葬者可能不会被唤醒，也可能会被唤醒但不得知任何消息。",
    "如果白天无人被处决，或发生了处决但无人死亡，但涡流在场，送葬者不会因此得知错误的信息。",
    "在夜晚因处决而死亡的玩家其角色不会被送葬者得知。",
  ],
  night: {
    order: 32, // Undertaker typically acts after the Demon to see the executed player (if it's not the first night)
    target: {
      count: { min: 0, max: 0 },
    },
    dialog: (_playerSeatId, _isFirstNight) => ({
      wake: "送葬者，请睁眼。这是今天被处决玩家的角色",
      instruction: "向其展示对应的角色标记（如果是酒鬼则展示‘酒鬼’身份）",
      close: "",
    }),
    handler: (context) => {
      const { executedToday, selfId } = context;
      if (executedToday === null || executedToday === undefined) {
        return null; // Should not even be called if no one executed, handled by generator
      }
      return {
        updates: [],
        logs: {
          privateLog: `送葬者(${selfId + 1}号) 查看了被处决玩家的角色`,
        },
      };
    },
  },
};
