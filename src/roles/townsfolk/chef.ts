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
    dialog: (playerSeatId, _isFirstNight, context) => {
      const { seats, isActorDisabledByPoisonOrDrunk = () => false } = context;
      const selfSeat = seats.find((s) => s.id === playerSeatId);
      const isDisabled =
        selfSeat &&
        typeof isActorDisabledByPoisonOrDrunk === "function" &&
        isActorDisabledByPoisonOrDrunk(selfSeat);
      const seatNo = playerSeatId + 1;

      // 计算相邻邪恶玩家对数
      let evilPairs = 0;
      for (let i = 0; i < seats.length; i++) {
        const current = seats[i];
        const next = seats[(i + 1) % seats.length];
        if (current.id === playerSeatId || next.id === playerSeatId) continue;
        // 与引擎结算保持一致：陌客 100% 注册为邪恶，间谍 100% 注册为善良。
        const isEvilForChef = (seat: (typeof seats)[number]) =>
          seat.role?.id === "recluse" ||
          ((seat.role?.type === "minion" || seat.role?.type === "demon") &&
            seat.role?.id !== "spy");
        const currentIsEvil = isEvilForChef(current);
        const nextIsEvil = isEvilForChef(next);
        if (currentIsEvil && nextIsEvil) evilPairs++;
      }

      let displayPairs = evilPairs;
      if (isDisabled) {
        const maxLimit = Math.max(3, evilPairs + 2);
        const fakeCandidates = Array.from({ length: maxLimit + 1 }, (_, i) => i).filter(
          (v) => v !== evilPairs
        );
        displayPairs =
          fakeCandidates.length > 0
            ? fakeCandidates[Math.floor(Math.random() * fakeCandidates.length)]
            : evilPairs === 0
              ? 1
              : 0;
      }

      return {
        wake: `唤醒${seatNo}号【厨师】，告诉他相邻邪恶玩家有 ${displayPairs} 对。`,
        instruction:
          displayPairs === 0 ? "（点头表示0）" : `（出示 ${displayPairs} 根手指）`,
        close: "",
      };
    },
  },
};
