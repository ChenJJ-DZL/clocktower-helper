import type { RoleDefinition } from "../../types/roleDefinition";

/**
 * 刺客
 * TODO: 添加角色描述
 */
export const assassin: RoleDefinition = {
  id: "assassin",
  name: "刺客",
  type: "minion",
  detailedDescription: `【背景故事】
“……”
【角色能力】
每局游戏限一次，在夜晚时*，你可以选择一名玩家：他死亡，即使因为任何原因让他不会死亡。
【角色简介】
刺客能杀死恶魔解决不掉的麻烦角色。
- 每局游戏限一次，在夜晚，刺客能杀死一名玩家。即使该玩家受到了包括角色能力在内的任何方式的保护而免于死亡，也依然会死亡。
- 刺客的能力如常受到醉酒和中毒的影响。
- 如果刺客攻击了莽夫，莽夫会死去并转变为邪恶阵营。
- 如果刺客攻击了尚未触发能力的僵怖（不论因为什么理由），僵怖会死去，但在死后触发能力且仍存活。
【范例】
> 范例: 在前三个夜晚刺客被唤醒，但是选择不行动。在第四个夜晚，刺客选择杀死弄臣。尽管弄臣还拥有自己的能力，他仍然死亡并保持已死亡状态。
> 范例: 茶艺师与两名善良玩家邻近。刺客选择杀死茶艺师的两名邻近玩家的其中之一，虽然受到茶艺师保护，该玩家依然死亡。
> 范例: 吟游诗人在场。主谋被处决。当晚，刺客选择杀死月之子，但是月之子没有死亡，因为刺客因吟游诗人而醉酒。
> 范例: 因侍臣而醉酒的刺客想要杀死莽夫。刺客已经失去能力，因此莽夫依然存活但转变为邪恶阵营。
【运作方式】
除了首个夜晚以外的每个夜晚，唤醒刺客。刺客要么摇头表示不使用能力，要么指向任意一名玩家。让刺客重新入睡。
如果刺客选择了玩家，该玩家死亡——将“死亡”提示标记放置到该玩家的角色标记旁。本次死亡不能通过任何方式来防止（除非刺客没有了能力，例如醉酒或中毒）。刺客失去自己的能力——将“失去能力”提示标记放置到刺客的角色标记旁，并从夜晚顺序表上移除其夜晚标记。（刺客不会再被唤醒。）
【提示标记】
- 死亡
放置时机：在刺客夜晚行动时选择使用能力，并选择了一名玩家后放置。
放置条件：刺客选择的玩家当前存活，且刺客未醉酒中毒，那么在该玩家的角色标记旁放置，用以提醒说书人在黎明时分宣布当晚的死亡玩家。
移除时机：在黎明时宣布死亡玩家后，说书人可以任由自己方便来进行移除。
- 失去能力
放置时机：在刺客夜晚行动时选择使用能力，并选择了一名玩家后放置。
放置条件：只要刺客选择了玩家，不论刺客是否醉酒中毒，都会将此标记放置在刺客角色标记旁。
移除时机：刺客死亡或离场时。
【提示与技巧】
- 很少有爪牙拥有你所拥有的力量，绝对掌控他人的生死。没有任何保护措施可以保护玩家免受您的袭击（无论如何，除非您喝醉了，别这样）。享受善良阵营对你的恐惧，并在最糟糕的时刻摧毁他们的心智！
- 杀死你的恶魔无法杀死的玩家。那个驱魔人是在阻止你的恶魔行动吗？不会再阻止了。那个和平主义者是在旅店老板的保护下吗？小把戏罢了。一个自鸣得意的水手给你带来麻烦？让他不能见到明早的太阳。没有什么能阻止你的刀锋，所以你不妨充分利用，去袭击那些认为自己不会被选中的玩家。
- 杀死玩家以混淆死亡人数并掩盖游戏中的恶魔类型。如果玩家怀疑僵怖在场，您可以在恶魔无法杀戮的夜晚袭击，这会混淆信息（特别是因为您的能力可以模仿有毒素的普卡）。另一个有用的例子是为休息的珀提供掩护-善良阵营不会看到没人死亡的情况，这使得你的大哥在爆发时更具破坏性。
- 与你的恶魔协调希望你袭击的人。对于像沙巴洛斯和珀这样的爆发恶魔来说尤其如此，他们每晚可以杀死很多玩家，所以这总是值得讨论以避免与他们选择同一个玩家。你的额外杀戮很强大，但因为你和恶魔都选择同一个目标而“失去”它真的很糟糕。在这种情况下，沟通不会让你浪费能力。
- 如果你不知道要杀谁，或者如果你觉得特别棘手，你可以在晚上杀死自己（或杀死一个邪恶的玩家），让那个邪恶的玩家看起来像一个善良玩家。由于邪恶的玩家很少会在晚上死去，所以善良阵营通常会假设任何在晚上死去的玩家都是好的，相信该玩家的信息并将他们的信息作为假设。如果你在这个过程中削弱了一个善良玩家的能力，这会非常有害——例如，如果你知道旅店老板在晚上保护你，然后你自杀了，你不仅早上看起来没有问题，而且旅店老板也会以为他们确实在保护你。
【对抗刺客】
当你要对抗刺客的时候，这里有几件事你应该记住：
- 别做梦了！刺客有机会杀死他们选择的任何玩家，而该玩家无法做任何事情来阻止死亡的发生。旅店老板保护不了他们，茶艺师也保护不了，弄臣、水手，甚至莽夫都会死在刺客手上。作为一名善良玩家，与刺客作战的最佳方式就是注意刺客何时袭击并在之后收拾残局。好消息是，刺客每场游戏只能杀死一名玩家，而教父通常可以杀死多名玩家。
【角色信息】
- 英文名：Assassin
- 所属剧本：黯月初升
- 角色类型：爪牙
- 角色能力类型：额外死亡、能力效果干扰、限次能力
其他称呼（非官方，仅方便索引用）：暗杀者
NewPP limit report
Cached time: 20260120025300
Cache expiry: 86400
Reduced expiry: false
Complications: []
CPU time usage: 0.031 seconds
Real time usage: 0.053 seconds
Preprocessor visited node count: 68/1000000
Post‐expand include size: 0/2097152 bytes
Template argument size: 0/2097152 bytes
Highest expansion depth: 2/40
Expensive parser function count: 0/100
Unstrip recursion depth: 0/20
Unstrip post‐expand size: 0/5000000 bytes
Transclusion expansion time report (%,ms,calls,template)
100.00%    0.000      1 -total
Saved in parser cache with key gstone_wiki:pcache:idhash:141-0!canonical and timestamp 20260120025300 and revision id 3006. Serialized with JSON.`,

  night: {
    order: (isFirstNight) => (isFirstNight ? 0 : 12),

    target: {
      count: {
        min: 1,
        max: 1,
      },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      if (isFirstNight) {
        return {
          wake: "",
          instruction: "",
          close: "",
        };
      }
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（刺客）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（刺客），请闭眼。`,
      };
    },

    handler: (context) => {
      const { targets, selfId, seats, gameState } = context;

      // 检查刺客是否已经使用过能力
      const assassinUsed = gameState?.assassinUsed ?? false;

      if (assassinUsed) {
        return {
          updates: [],
          logs: {
            privateLog: `刺客（${selfId + 1}号）已经使用过能力，无法再次使用`,
          },
        };
      }

      if (targets.length === 0) {
        return {
          updates: [],
          logs: {
            privateLog: `刺客（${selfId + 1}号）未选择目标`,
          },
        };
      }

      const targetId = targets[0];
      const targetSeat = seats.find((s) => s.id === targetId);

      // 刺客的攻击无视任何保护
      const updates: Array<Partial<Seat> & { id: number }> = [];

      // 使目标死亡（无视任何保护）
      updates.push({
        id: targetId,
        isDead: true,
      });

      // 标记刺客已使用能力
      return {
        updates,
        logs: {
          privateLog: `刺客（${selfId + 1}号）使用能力杀死了 ${targetId + 1}号玩家（无视任何保护）`,
        },
        gameStateUpdates: {
          assassinUsed: true,
        },
      };
    },
  },
};
