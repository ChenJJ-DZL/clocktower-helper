import type { RoleDefinition } from "../../types/roleDefinition";

/**
 * 旅店老板
 * TODO: 添加角色描述
 */
export const innkeeper: RoleDefinition = {
  id: "innkeeper",
  name: "旅店老板",
  type: "townsfolk",
  detailedDescription: `【背景故事】
“到里头来，美丽的旅者，放松筋骨，好好歇息。尽管饮酒作乐，黑暗之物今夜无法伤你分毫。”
【角色能力】
每个夜晚*，你要选择两名玩家：他们当晚不会死亡，但其中一人会醉酒到下个黄昏。
【角色简介】
旅店老板在夜晚保护玩家们免于死亡，但是某些人在此过程中会醉酒。
- 与僧侣类似，旅店老板能让玩家们不被恶魔杀死。受保护的玩家也不会因为外来者、爪牙、镇民和旅行者的能力而死亡。
- 旅店老板只在夜晚保护玩家，并不包括白天。
- 旅店老板选择的两名玩家其中之一将在当晚和下一个白天醉酒。该玩家可以是善良的或邪恶的，但几乎总会是善良的，这取决于你的游戏走向。选择了自己的旅店老板可能会醉酒，这意味着他会失去能力并且当晚可以死亡，而他保护的另一个人也不再安全。
【范例】
> 范例: 旅店老板保护了弄臣和侍女。说书人选择让弄臣醉酒。明天，当弄臣被处决时，他会死亡，即使他还没有使用自己的能力。
> 范例: 旅店老板保护了刺客和珀。说书人选择让刺客醉酒。当晚的后续时段中，刺客使用了自己的能力，但是无事发生。
> 范例: 旅店老板保护了他自己和和平主义者。说书人选择让旅店老板醉酒。当晚，恶魔攻击了和平主义者，和平主义者死亡。
【运作方式】
除了首个夜晚以外的每个夜晚，唤醒旅店老板。让旅店老板指向任意两名玩家。让旅店老板重新入睡。将“不会死亡”提示标记放置到所选的两个角色标记旁。所选玩家其中一人醉酒——将“醉酒”提示标记放置到该玩家的角色标记旁。标有“不会死亡”的玩家当晚不会死亡。
在黎明，移除“不会死亡”提示标记。
在黄昏，移除“醉酒”提示标记。
【提示标记】
- 不会死亡
放置时机：在旅店老板夜晚行动并选择了玩家后。
放置条件：在旅店老板选择的两名玩家的角色标记旁分别各放置一个此标记。若此时旅店老板醉酒中毒，不放置该标记。
移除时机：在黎明时，或旅店老板死亡或离场时。
- 醉酒
放置时机：在成功放置了旅店老板的“不会死亡”提示标记后。
放置条件：在旅店老板当晚选择的两名玩家之中，由说书人选择一名玩家，在他的角色标记旁放置。
移除时机：在黄昏时，或旅店老板死亡或离场时。

【提示与技巧】
- 你的能力很强大，如果有效使用，你可以阻止邪恶阵营的侵害，并保护善良玩家的安全。然而，这是有代价的——任何受你保护的人都变得不可靠，因为他们可能会在幸存的那晚醉酒。与强力的玩家合作，保护关键的角色，这非常重要——某些角色（例如和平主义者和驱魔人）生存时间越长越强大。
- 注意你的能力会导致醉酒！不要保护在当晚需要接收可靠信息的人或那些将使用他们能力的人。例如，如果你知道一个侍臣即将使用他们的能力，你保护他们可能会导致他们醉酒因此浪费他们的强大能力！
- 你保护的人，与你公开声称要保护的人，可以不一样。因为如果邪恶阵营相信你说的话，他们不会想浪费时间瞄准那些不能被杀死的玩家。同时，你秘密地保护其他可能成为受害者的玩家，希望他们能免遭杀戮。
- 用自己的能力保护自己似乎是个好主意，但通常不建议这样做——因为说书人很可能会选择让你醉酒，让你的保护完全失效，这样你和另一个玩家都会很危险。
- 如果你认为你至少辨别了2个邪恶的玩家，请同时选择他们！保护他们免于死亡并不理想，但这确实意味着他们中的一个会在那天晚上醉酒。如果你设法抓住了恶魔或像刺客或魔鬼代言人这样的强大爪牙，你就从源头上切断了邪恶的能力！但是，如果你选错了，那么大概率就是善良玩家醉酒了。
【伪装成旅店老板】
当你要伪装成旅店老板的时候，这里有几件事你应该记住：
- 如果你是恶魔，请杀死你声称要保护的玩家不同的玩家。如果你声称在晚上保护了侍女，而侍女在早上死了，那么你就得去解释。如果你是恶魔，或者你是可以与恶魔私聊战术的爪牙，你可以攻击与你声称要保护的玩家不同的玩家。
- 如果你的邪恶阵营同伴的表演得不太好，请声称你保护了他们。这将使他们中的一个或两个看起来像是醉酒了，这使他们的失误显得合理，同时也为他们还活着提供了额外的理由。
- 如果善良的玩家拥有特别强的能力，请声称要保护他们。让他们觉得自己有醉酒的可能性，这样他们会很困惑，从而有效地抵消他们的能力。
- 私下告诉人们你是旅店老板，这可以获得善良阵营信任，同时给善良方制作很多麻烦。善良的玩家通常会想要向旅店老板透露他们的角色，以便获得旅店老板的保护（如果他们是一个不惜一切代价想要活下去的角色）或确保旅店老板永远不会选择他们（因为他们需要清醒地使用他们的能力）。知道哪些玩家是哪些角色可以直接帮助你，因为你知道要杀谁，而同时那些玩家也会更信任你。
- 准备好后备的虚张声势，以防人们太怀疑你在游戏后期还活着。旅店老板很少能活到游戏后期，但并非不可能。你有充分的理由“撒谎”，例如自称是弄臣。诸如弄臣,水手,莽夫或坐在茶艺师旁边的玩家等角色都有充分的理由谎报自己的角色以吸引恶魔的注意，而旅店老板是恶魔特别喜欢的目标，所以在游戏后期，当你旅店老板的角色受怀疑时，你大可考虑再扮演这些角色。
【角色信息】
- 英文名：Innkeeper
- 所属剧本：黯月初升
- 角色类型：镇民
- 角色能力类型：免死、醉酒
NewPP limit report
Cached time: 20260119180304
Cache expiry: 86400
Reduced expiry: false
Complications: []
CPU time usage: 0.021 seconds
Real time usage: 0.029 seconds
Preprocessor visited node count: 64/1000000
Post‐expand include size: 0/2097152 bytes
Template argument size: 0/2097152 bytes
Highest expansion depth: 2/40
Expensive parser function count: 0/100
Unstrip recursion depth: 0/20
Unstrip post‐expand size: 0/5000000 bytes
Transclusion expansion time report (%,ms,calls,template)
100.00%    0.000      1 -total
Saved in parser cache with key gstone_wiki:pcache:idhash:15-0!canonical and timestamp 20260119180304 and revision id 4869. Serialized with JSON.`,
  clarifications: [
    "相克规则：利维坦：如果利维坦在场，旅店老板保护的玩家免疫所有邪恶阵营的负面效果。暴乱：如果暴乱在场，旅店老板保护的玩家免疫所有邪恶阵营的负面效果。",
  ],

  night: {
    order: (isFirstNight) => (isFirstNight ? 0 : 2),

    target: {
      count: {
        min: 2,
        max: 2,
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
        wake: `唤醒${playerSeatId + 1}号玩家（旅店老板）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（旅店老板），请闭眼。`,
      };
    },

    handler: (context) => {
      const { targets, selfId, seats } = context;
      if (targets.length !== 2) return null;

      const [aId, bId] = targets;
      // 模拟说书人随机选择（或固定逻辑，正式版可出弹窗）
      const drunkTargetId = Math.random() < 0.5 ? aId : bId;
      const clearTime = "次日黄昏";

      const updates = [aId, bId].map((id) => {
        const seat = seats.find((s) => s.id === id);
        const update: any = { id, isProtected: true, protectedBy: selfId };
        if (id === drunkTargetId) {
          update.isDrunk = true;
          update.statusDetails = [
            ...(seat?.statusDetails || []),
            `旅店老板致醉${clearTime}清除`,
          ];
          update.statuses = [
            ...(seat?.statuses || []),
            { effect: "Drunk", duration: clearTime },
          ];
        }
        return update;
      });

      return {
        updates,
        logs: {
          privateLog: `旅店老板本夜保护了 ${aId + 1}号 和 ${bId + 1}号玩家，其中 ${drunkTargetId + 1}号 醉酒。`,
        },
      };
    },
  },
};
