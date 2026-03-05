import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 洗衣妇 (Washerwoman)
 * 说明：首夜得知一名村民的具体身份。
 * 当前占位：已在 nightLogic 中实现。
 */
export const washerwoman: RoleDefinition = {
  id: "washerwoman",
  name: "洗衣妇",
  type: "townsfolk",
  detailedDescription: "在你的首个夜晚，你会得知两名玩家和一个镇民角色：这两名玩家之一是该角色。\n\n**运作方式:**\n在为首个夜晚进行准备时，将洗衣妇的“镇民”提示标记放置在任意一个镇民角色标记旁，然后将洗衣妇的“错误”提示标记放置在任意其他角色标记旁。\n在首个夜晚里，唤醒洗衣妇，并指向标记有“镇民”和“错误”的玩家。将标记有“镇民”的玩家的角色标记展示给洗衣妇。让洗衣妇重新入睡。在说书人方便的时候，移除洗衣妇的提示标记。\n\n**提示与技巧:**\n- 在第一天尽早公布你的信息，甚至在你得知你查看到的镇民是谁之前。这样你就证实了那个人不是爪牙或恶魔，然后你们可以相互照应从而增加你们活到游戏最后的几率。\n- 由于你一共有两名查验目标，如果你的其中一名查验目标被处决或者是死了的话，不要惊慌！也许另一名玩家才是你查看到的那个镇民。\n- 如果你查看到的另一名玩家没跳那个被你看到的镇民角色，那么那个跳了的玩家就肯定是你查验到的镇民了。\n- 不要忘了防备间谍。由于间谍那被当做善良角色的能力，你非常有可能把间谍当成你想找的那个镇民。\n- 你也可以用通过向那个镇民许诺他会在之后得到你的选票，来换取对方不对你进行提名的私下协议。",
  clarifications: [
    "洗衣妇不会对自身进行探查，提示标记不会放置在洗衣妇自己以及和自己相关的标记旁。但在洗衣妇存在多个且因为特殊情况都在同一天夜晚被唤醒时（比如当游荡场上存在多个洗衣妇并需要获取信息时），一个洗衣妇有可能探查到另一个洗衣妇的存在。",
    "如果在首夜就中毒或醉酒，洗衣妇可能会得知错误的玩家（没有放置他的提示标记的玩家），或得知错误的角色，或两者兼而有之。但即使如此，说书人也应当让洗衣妇得知镇民角色。"
  ],
  firstNight: {
    order: 49,
    target: {
      count: { min: 2, max: 2 },
      canSelect: (target, self, allSeats) => target.id !== self.id,
    },
    dialog: (playerSeatId, isFirstNight, context) => {
      const { seats, shouldShowFake, isPoisoned, roles = [] } = context;

      // 这里的逻辑模仿 nightLogic 中的实现
      const targetSeat = seats.find(s => s.id === playerSeatId);
      const effectiveRole = targetSeat?.role?.id === 'drunk' ? targetSeat.charadeRole : targetSeat?.role;

      if (!effectiveRole) return { wake: "洗衣妇，请睁眼", instruction: "出错了", close: "洗衣妇，请闭眼" };

      // 选出两个玩家和一个镇民角色
      // 注意：由于 dialog 是纯函数且多次调用需一致，如果是随机选择，可能会有问题
      // 但在 calculateNightInfo 中，我们会把 context 传进来。

      // 这里的实现应当与 nightLogic 保持某种程度的一致性，或者由 handler 提前计算好存入 context
      // 但目前的架构是 dialog 先于 handler 执行。

      // 临时方案：直接在这里实现逻辑（由于 Math.random()，如果多次调用结果会变，这在 UI 上可能是个问题）
      // 更好的办法是在 calculateNightInfo 中预先计算好 info 放入 context.actionData

      return {
        wake: "🧺 洗衣妇，请睁眼。请看这两名玩家",
        instruction: "其中一位是特定的镇民，另一位不是。",
        close: "洗衣妇，请闭眼。",
      };
    },
  }
};
