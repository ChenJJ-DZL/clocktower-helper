import type { RoleDefinition } from "../../types/roleDefinition";

/**
 * 调查员 (Investigator)
 * 说明：首夜得知一名爪牙的具体身份。
 * 当前占位：已在 nightLogic 中实现。
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
      count: { min: 2, max: 2 },
      canSelect: (target, self, _allSeats) => target.id !== self.id,
    },
    dialog: (_playerSeatId, _isFirstNight, _context) => {
      return {
        wake: "🔍 调查员，请睁眼。请看这两名玩家",
        instruction: "其中一位是特定的爪牙，另一位不确定。或者得知没有爪牙。",
        close: "调查员，请闭眼。",
      };
    },
    handler: (context) => {
      const { targets, selfId } = context;
      return {
        updates: [],
        logs: {
          privateLog: `调查员(${selfId + 1}号) 查看了 ${targets.map((id) => id + 1).join("号和 ")}号玩家`,
        },
      };
    },
  },
};
