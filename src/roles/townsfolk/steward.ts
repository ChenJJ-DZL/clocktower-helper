import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 事务官 (Steward) - 扩展镇民（隐藏占位）
 *
 * 说明来源：josn/blood_clocktower_所有镇民.json
 * 目前仅加入角色库，不参与前台剧本选择，也不注入额外判定逻辑（避免影响现有流程）。
 */
export const steward: RoleDefinition = {
  id: "steward",
  name: "事务官",
  type: "townsfolk",
  detailedDescription: `【背景故事】
“你竟敢指责夫人的过错？我认识她一辈子了！整整九年！”
【角色能力】
在你的首个夜晚，你会得知一名善良玩家。
【角色简介】
事务官会得知一名善良玩家。
- 事务官得知的是玩家，但不得知他的具体角色。
- 事务官会在首个夜晚得知他的信息。
- 如果事务官在游戏中途被创造，事务官会在当晚得知信息。
【范例】
> 范例: 事务官得知小艾是善良玩家。小艾是送葬者。
> 范例: 麻脸巫婆将罂粟种植者变成了事务官。当晚，事务官得知小黑是善良玩家。小黑是间谍，但被当作善良阵营。
【运作方式】
在为首个夜晚进行准备时，将事务官的“得知”提示标记放置在任意一名善良玩家的角色标记旁。
在首个夜晚，唤醒事务官，并指向标记有“得知”的那名玩家。让事务官重新入睡。
【提示标记】
- 得知
放置时机：在为首个夜晚做准备时放置。
放置条件：放置在一名善良玩家的角色标记旁边。
移除时机：在事务官获取信息后，说书人可以任由自己方便来进行移除。
【提示与技巧】
- 你会得知一名既不是恶魔也不是爪牙的玩家。这是很棒的信息！你可以相信他是怀着善意为你们阵营行动，并且只有醉酒和中毒会干扰他们的信息。运用你的信息与其他人共同努力去通关游戏。
- 直接公开自己的信息。如果所有人都知道你和你得知的玩家都是善良的，他们可以直接将这个信息加入到他们的逻辑线构建和能力选择方案里。你的信息不会让游戏通关，但它很有用，所以让大家都知道这个信息吧。
- 与你得知的玩家私聊，并且为了让他能够存活而隐藏你的信息。如果让恶魔听到你的信息并且相信这是真的，那么恶魔会认为让你得知的玩家存活到三人决赛圈是危险的事情。所以恶魔会希望这名玩家最先死亡。因此，不说出你的信息也许有助于让那名玩家存活。
- 一旦公开你的信息，让玩家们把这条信息纳入他们的逻辑线构建中！你知道自己以及你得知的玩家都是善良的，所以如果有逻辑线认为你们之中有邪恶玩家，那么另一个人也必须是邪恶玩家。通常来说，这意味着构建一条你们都是邪恶玩家的逻辑线最终会得到邪恶玩家过多的结论，而你可以根据这个结论作出相应的辩解。
【伪装成事务官】
- 事务官是这个游戏最简单的伪装之一，同时也是一个优秀的备用伪装。伪装成事务官，声称恶魔是你得知的玩家。如果玩家们信任你，那么恶魔看起来会是善良的，你的工作就完成了。
- 将一名善良玩家作为你的事务官信息声明出来，然后确保其他玩家使用自身能力来指向你是邪恶玩家！你会把那名玩家一起拖下水，但是直到善良阵营花费好几天时间才有机会发现你是邪恶的。所以在你被处决之前，你还能够有好几天的时间来使用你的爪牙能力。
- 将一名善良玩家作为你的事务官信息声明出来，并尝试与他们一起努力“通关”。如果你们能努力地作为一对合作搭档而被信任，你可以在没有受到太多嫌疑的情况下存活度过整局游戏。
【角色信息】
- 英文名：Steward
- 所属剧本：实验性角色、沸反盈天（快速上手剧本）
- 角色类型：镇民
- 角色能力类型：进场能力、获取信息
NewPP limit report
Cached time: 20260120052346
Cache expiry: 86400
Reduced expiry: false
Complications: []
CPU time usage: 0.026 seconds
Real time usage: 0.049 seconds
Preprocessor visited node count: 34/1000000
Post‐expand include size: 0/2097152 bytes
Template argument size: 0/2097152 bytes
Highest expansion depth: 2/40
Expensive parser function count: 0/100
Unstrip recursion depth: 0/20
Unstrip post‐expand size: 0/5000000 bytes
Transclusion expansion time report (%,ms,calls,template)
100.00%    0.000      1 -total
Saved in parser cache with key gstone_wiki:pcache:idhash:410-0!canonical and timestamp 20260120052346 and revision id 3335. Serialized with JSON.`,
  night: {
    order: 0,
    target: { count: { min: 0, max: 0 } },
    dialog: () => ({
      wake: "",
      instruction: "",
      close: "",
    }),
    handler: () => ({
      updates: [],
      logs: {},
    }),
  },
};


