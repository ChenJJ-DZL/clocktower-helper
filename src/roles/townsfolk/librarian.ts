import type { RoleDefinition } from "../../types/roleDefinition";

/**
 * 图书管理员 (Librarian)
 * 说明：首夜得知两名玩家和一个外来者角色：这两名玩家之一是该角色（或者得知没有外来者在场）。
 *
 * 实现依据：参考 json/full/all_characters.json 图书管理员条目
 * - "在你的首个夜晚，你会得知两名玩家和一个外来者角色：这两名玩家之一是该角色
 *   （或者你会得知没有外来者在场）。"
 * - "在为首个夜晚进行准备时，将图书管理员的'外来者'提示标记放置在任意一个外来者
 *   角色标记旁，然后将图书管理员的'错误'提示标记放置在任意其他角色标记旁。"
 * - "放置条件：放置在一个对应外来者角色或能被当作外来者角色的角色标记旁边。"
 *   间谍（spy）和陌客（recluse）可被当作外来者。
 * - "在仅有一名外来者且为陌客的情况下，图书管理员可能会将陌客当作非外来者角色，
 *   从而得知没有外来者在场。"
 */
export const librarian: RoleDefinition = {
  id: "librarian",
  name: "图书管理员",
  type: "townsfolk",
  detailedDescription:
    "在你的首个夜晚，你会得知两名玩家和一个外来者角色：这两名玩家之一是该角色（或者你会得知没有外来者在场）。\n\n**运作方式:**\n在为首个夜晚进行准备时，将图书管理员的'外来者'提示标记放置在任意一个外来者角色标记旁，然后将图书管理员的'错误'提示标记放置在任意其他角色标记旁。\n在首个夜晚里，唤醒图书管理员，并指向标记有'外来者'和'错误'的玩家。将标记有'外来者'的玩家的角色标记展示给图书管理员。让图书管理员重新入睡。在说书人方便的时候，移除图书管理员的提示标记。\n\n**提示与技巧:**\n- 在第一天尽早公布你的信息，甚至在你得知你查看到的镇民是谁之前。由于外来者通常都有某些负面效果或者是动机，当你知道他们在这个团队里，你在很大程度上就能减轻他们在游戏早期的那种不知所措。\n- 由于你一共有两名查验目标，如果你的其中一名查验目标被处决或者是死了的话，不要惊慌！也许另一名被查验目标才是外来者。\n- 如果你查验的两名玩家中其中一名不是那个外来者的话，那么他就是你想找的那个人了。\n- 得知场上没有外来者是非常非常有用的信息——这意味着没有陌客能够对你们的情报进行干扰，也没有酒鬼给你们提供错的情报，并且也没有圣徒给善良阵营帮倒忙。如果确实是有外来者跳出来了的话，那你就抓到他们的把柄了——在撒谎！（当然了除了他们是被男爵塞进来的这种情况之外）\n- 因为游戏里总是会有一个酒鬼（或者陌客），如果图书管理员告诉两位玩家之一是酒鬼的话，他们两个就会明白哪怕他们的角色似乎是一个强有力的镇民角色，他们也是获得错误的晚间情报或者压根他们的能力就没有生效！这实际上等于把酒鬼变成了拥有完全能力的镇民，这样他就可以找出其他的邪恶玩家了。另外这也是个能够很好地把酒鬼从一连串对好人有利的伪造情报中唤醒的办法！",
  clarifications: [
    "在仅有一名外来者且为陌客的情况下，图书管理员可能会将陌客当作非外来者角色，从而得知没有外来者在场。",
    "由于间谍的存在，很有可能出现某局游戏一共有两名外来者，但图书管理员却得知'0'。因为间谍可以将自己当做非外来者角色，从而导致场上没有真正的外来者在场。",
    "如果在首夜就中毒或醉酒，图书管理员可能会得知错误的玩家（没有放置他的提示标记的玩家），或得知错误的角色，或两者兼而有之。但即使如此，说书人也应当让图书管理员得知外来者角色，否则等同于在明示图书管理员他自己醉酒中毒。",
  ],
  firstNight: {
    order: 50,
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

      if (isDisabled) {
        // 中毒/醉酒：随机返回虚假信息
        const otherSeats = seats.filter((s) => s.id !== playerSeatId && s.role);
        const shuffled = [...otherSeats].sort(() => Math.random() - 0.5);
        const seat1 = shuffled[0];
        const seat2 = shuffled[1] || shuffled[0];
        const seat1No = seat1 ? seat1.id + 1 : "?";
        const seat2No = seat2 ? seat2.id + 1 : "?";
        const fakeRoleName = "圣徒";
        return {
          wake: `唤醒${seatNo}号【图书管理员】，告诉他${seat1No}号和${seat2No}号其中一位是【${fakeRoleName}】。`,
          instruction: "受干扰状态，信息可能不准确",
          close: "",
        };
      }

      // 排除自己
      const otherSeats = seats.filter((s) => s.id !== playerSeatId && s.role);

      // 找可被当作外来者的玩家：真正的外来者 + 间谍/陌客（可注册为外来者）
      const outsiderCandidates = otherSeats.filter((s) => {
        if (!s.role) return false;
        if (s.role.type === "outsider") return true;
        if (s.role.id === "spy" || s.role.id === "recluse") return true;
        return false;
      });

      // 无外来者候选 → 手势 0
      if (outsiderCandidates.length === 0) {
        return {
          wake: `唤醒${seatNo}号【图书管理员】，告诉他场上没有外来者在场（手势 0）。`,
          instruction: "（手势 0）",
          close: "",
        };
      }

      // 随机选一名真·外来者（或可当作外来者的玩家）
      const targetOutsider =
        outsiderCandidates[
          Math.floor(Math.random() * outsiderCandidates.length)
        ];

      // 随机选一名干扰项（不能与目标相同，不能是自己）
      const decoyPool = otherSeats.filter((s) => s.id !== targetOutsider.id);
      const decoyPlayer =
        decoyPool.length > 0
          ? decoyPool[Math.floor(Math.random() * decoyPool.length)]
          : targetOutsider; // 兜底

      // 获取外来者的角色名称
      const targetRoleName =
        targetOutsider.effectiveRole?.name ??
        targetOutsider.role?.name ??
        "外来者";

      // 随机打乱展示顺序
      const shuffled =
        Math.random() < 0.5
          ? [targetOutsider, decoyPlayer]
          : [decoyPlayer, targetOutsider];

      const seat1No = shuffled[0].id + 1;
      const seat2No = shuffled[1].id + 1;

      return {
        wake: `唤醒${seatNo}号【图书管理员】，告诉他${seat1No}号和${seat2No}号其中一位是【${targetRoleName}】。`,
        instruction: "",
        close: "",
      };
    },
  },
};
