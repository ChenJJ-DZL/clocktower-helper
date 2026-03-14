import type { RoleDefinition } from "../../types/roleDefinition";

/**
 * 厨师 (Chef)
 * 说明：首夜得知有多少对邪恶玩家相邻。
 * 当前占位：已在 nightLogic 中实现。
 */
export const chef: RoleDefinition = {
  id: "chef",
  name: "厨师",
  type: "townsfolk",
  detailedDescription:
    '在你的首个夜晚，你会得知场上邻座的邪恶玩家有多少对。\n\n**运作方式:**\n在首个夜晚里，唤醒厨师。为厨师用手势比划场上互为邻座的邪恶玩家有多少对（0，1，2，等等）。让厨师重新入睡。\n\n**提示与技巧:**\n- 在游戏开始，单看你自己的信息并不是非常有用，但如果你将你的信息与你队友的信息相结合，就会变得非常有用了。\n- 你所掌握的信息——场上邪恶玩家是否邻座——将决定游戏的最终结果。\n- 得到信息"0"意味着没有邪恶玩家邻座；记得在白天寻找有哪些窃窃私语的玩家。\n- 得到信息"1"或更多意味着场上的邪恶玩家是坐在一起的。\n- 得到信息"2"意味着场上邪恶阵营是两两一对分开座的，或者是三位连在一起。',
  clarifications: [
    "厨师的单次能力会为玩家进行多次检测判断。因此具有互动干扰类能力的角色可能会在与其左右相邻的玩家组合中被当作不同的阵营。",
    "厨师的能力探查的是相邻玩家，且并未加“存活”这一附加条件。中途产生的厨师获取的信息仍然会考虑仍然在游戏中的所有玩家。",
  ],
  firstNight: {
    order: 52,
    target: {
      count: { min: 0, max: 0 },
    },
    dialog: (_playerSeatId, _isFirstNight) => ({
      wake: "厨师，请睁眼。这是相邻邪恶玩家的对数",
      instruction: "请出示手指告诉厨师（0对应点头，1、2等对应数字）",
      close: "厨师，请闭眼。",
    }),
    handler: (context) => {
      const { selfId } = context;
      return {
        updates: [],
        logs: {
          privateLog: `厨师(${selfId + 1}号) 获取了相邻邪恶玩家信息`,
        },
      };
    },
  },
};
