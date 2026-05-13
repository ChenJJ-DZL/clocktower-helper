import type { RoleDefinition } from "../../types/roleDefinition";

/**
 * 调查员 (Investigator)
 * 说明：首夜得知两名玩家和一个爪牙角色：这两名玩家之一是该角色（或者得知没有爪牙在场）。
 *
 * 实现依据：参考 json/full/all_characters.json 调查员条目
 * - "在你的首个夜晚，你会得知两名玩家和一个爪牙角色：这两名玩家之一是该角色
 *   （或者你会得知没有爪牙在场）。"
 * - "在为首个夜晚进行准备时，将调查员的'爪牙'提示标记放置在任意一个爪牙角色
 *   标记旁，然后将调查员的'错误'提示标记放置在任意其他角色标记旁。"
 * - "放置条件：放置在一个对应爪牙角色或能被当作爪牙角色的角色标记旁边。"
 *   间谍（spy）和陌客（recluse）可被当作爪牙。
 * - "在仅有一名爪牙且为间谍的情况下，调查员可能会将间谍当作非爪牙角色，
 *   从而得知没有爪牙在场。"
 */
export const investigator: RoleDefinition = {
  id: "investigator",
  name: "调查员",
  type: "townsfolk",
  detailedDescription:
    "在你的首个夜晚，你会得知两名玩家和一个爪牙角色：这两名玩家之一是该角色（或者你会得知没有爪牙在场）。\n\n**运作方式:**\n在为首个夜晚进行准备时，将调查员的“爪牙”提示标记放置在任意一个爪牙角色标记旁，然后将调查员的“错误”提示标记放置在任意其他角色标记旁。\n在首个夜晚里，唤醒调查员，并指向标记有“爪牙”和“错误”的玩家。将标记有“爪牙”的玩家的角色标记展示给调查员。让调查员重新入睡。在说书人方便的时候，移除调查员的提示标记。\n\n**提示与技巧:**\n- 在第一天尽早公布你的信息。你可能无法确定到底哪位玩家是爪牙，但如果你成功让大家相信你的话，那么善良阵营是有足够的时间将两名玩家全都处决的，这将确保最后一天一定少了一名爪牙。\n- 尽管只靠你自己的信息还不足矣给一位玩家定性，但是你可以将你的信息和其他善良阵营玩家的信息相结合。\n- 当心陌客！因为他可能会被你当作爪牙。",
  clarifications: [
    "在仅有一名爪牙且为间谍的情况下，调查员可能会将间谍当作非爪牙角色，从而得知没有爪牙在场。",
    "由于麻脸巫婆这样的角色存在，很有可能出现某局游戏进行到一半时没有任何爪牙角色在场，此时有新的调查员产生时，也会因此得知“0”。",
    "如果在首夜就中毒或醉酒，调查员可能会得知错误的玩家（没有放置他的提示标记的玩家），或得知错误的角色，或两者兼而有之。但即使如此，说书人也应该让调查员得知爪牙角色，否则等同于在明示调查员他自己醉酒中毒。",
  ],
  firstNight: {
    order: 51,
    target: {
      count: { min: 0, max: 0 },
    },
    dialog: (playerSeatId, _isFirstNight, context) => {
      const { seats, isActorDisabledByPoisonOrDrunk = () => false } = context;
      const selfSeat = seats.find((s) => s.id === playerSeatId);
      const isDisabled = selfSeat && typeof isActorDisabledByPoisonOrDrunk === "function" && isActorDisabledByPoisonOrDrunk(selfSeat);

      const seatNo = playerSeatId + 1;

      if (isDisabled) {
        // 中毒/醉酒：随机返回虚假信息
        const otherSeats = seats.filter((s) => s.id !== playerSeatId && s.role);
        const shuffled = [...otherSeats].sort(() => Math.random() - 0.5);
        const seat1 = shuffled[0];
        const seat2 = shuffled[1] || shuffled[0];
        const seat1No = seat1 ? seat1.id + 1 : "?";
        const seat2No = seat2 ? seat2.id + 1 : "?";
        const minions = seats.filter((s) => s.role?.type === "minion");
        const fakeRole = minions.length > 0 ? minions[Math.floor(Math.random() * minions.length)].role : null;
        const fakeRoleName = fakeRole?.name || "投毒者";
        return {
          wake: `唤醒${seatNo}号【调查员】，告诉他${seat1No}号和${seat2No}号其中一位是【${fakeRoleName}】。`,
          instruction: "受干扰状态，信息可能不准确",
          close: "",
        };
      }

      // 排除自己
      const otherSeats = seats.filter((s) => s.id !== playerSeatId && s.role);

      // 找可被当作爪牙的玩家：真正的爪牙
      const minionCandidates = otherSeats.filter((s) => {
        if (!s.role) return false;
        return s.role.type === "minion";
      });

      // 无爪牙候选 → 手势 0
      if (minionCandidates.length === 0) {
        return {
          wake: `唤醒${seatNo}号【调查员】，告诉他场上没有爪牙在场（手势 0）。`,
          instruction: `（手势 0）`,
          close: "",
        };
      }

      // 随机选一名真·爪牙（或可当作爪牙的玩家）
      const targetMinion =
        minionCandidates[Math.floor(Math.random() * minionCandidates.length)];

      // 随机选一名干扰项（不能与目标相同，不能是自己）
      const decoyPool = otherSeats.filter((s) => s.id !== targetMinion.id);
      const decoyPlayer =
        decoyPool.length > 0
          ? decoyPool[Math.floor(Math.random() * decoyPool.length)]
          : targetMinion; // 兜底

      // 获取爪牙的角色名称（使用 effectiveRole 以防酒鬼）
      const targetRoleName = targetMinion.effectiveRole?.name ?? targetMinion.role?.name ?? "爪牙";

      // 随机打乱展示顺序
      const shuffled =
        Math.random() < 0.5
          ? [targetMinion, decoyPlayer]
          : [decoyPlayer, targetMinion];

      const seat1No = shuffled[0].id + 1;
      const seat2No = shuffled[1].id + 1;

      return {
        wake: `唤醒${seatNo}号【调查员】，告诉他${seat1No}号和${seat2No}号其中一位是【${targetRoleName}】。`,
        instruction: "",
        close: "",
      };
    },
  },
};
