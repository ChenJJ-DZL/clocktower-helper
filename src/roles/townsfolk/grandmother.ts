import { RoleDefinition, NightActionContext } from "../../types/roleDefinition";
import { Seat } from "../../../app/data";

/**
 * 祖母 (Grandmother)
 * 说明：在你的首个夜晚，你会得知一名善良玩家和他的角色。如果恶魔杀死了他，你也会死亡。
 * 当前占位：已在 nightLogic 中实现。
 */
export const grandmother: RoleDefinition = {
  id: "grandmother",
  name: "祖母",
  type: "townsfolk",
  detailedDescription: `【背景故事】
“我的小心肝呀，如果你要出门，记得加件外套。这是你的保温杯。这是你的围巾。你知道我心脏不太好。要是你感冒了，或者有个三长两短，我该怎么办？”
【角色能力】
在你的首个夜晚，你会得知一名善良玩家和他的角色。
如果恶魔杀死了他，你也会死亡。
【角色简介】
祖母知道自己的孙子是谁，但是如果孙子被恶魔杀死，祖母也会死亡。
- 在首个夜晚，祖母会得知自己的孙子——一名善良玩家的镇民或外来者角色信息。孙子不会得知自己有位祖母。
- 如果恶魔杀死了孙子，祖母也会死亡。如果孙子通过任何其他方式死亡——例如处决，或在夜晚因其他原因死亡——祖母不会因此死亡。
【范例】
> 范例: 在首个夜晚，祖母被唤醒并得知自己的孙子小佳是教授。三个夜晚后，小佳被恶魔杀死，因此祖母也一同死亡。
> 范例: 祖母得知自己的孙子小莱是赌徒。小莱进行赌博且因此而死亡。祖母依然存活。
> 范例: 祖母得知自己的孙子小美是修补匠。小美被恶魔杀死，但祖母因为水手的能力而处于醉酒状态，因此祖母依然存活。
【运作方式】
在为首个夜晚进行准备时，通过将“孙子”提示标记放置到任意一个善良角色的角色标记旁来选择一名“孙子”。
在首个夜晚，唤醒祖母，向其展示标有“孙子”的角色标记，然后指向该名“孙子”玩家，然后让祖母重新入睡。
如果恶魔杀死了“孙子”，祖母死亡——将“死亡”提示标记放置到祖母的角色标记旁。
【提示标记】
- 孙子
放置时机：在为首个夜晚做准备时放置。
放置条件：放置在一个善良角色或能被当作善良角色的角色标记旁边。
移除时机：祖母死亡或离场后。
- 死亡
放置时机：在恶魔杀死了被标记有“孙子”的玩家时放置。
放置条件：恶魔杀死“孙子”，且祖母未醉酒中毒时，放置在祖母角色标记旁边，用以提醒说书人在黎明时分宣布当晚的死亡玩家。
移除时机：在黎明时宣布死亡玩家后，说书人可以任由自己方便来进行移除。

【提示与技巧】
- 保护你心爱的孙子！他们绝对是善良的，这一点在黯月初升剧本中非常珍贵（除非你第一夜就中毒或者醉酒，那你可能错认孙子的角色，甚至误以为某个邪恶玩家是你的孙子，而不知道你的真孙子是谁，但是你的真孙子一定是善良的）。此外，如果他们被恶魔杀死，你也会死--也算是你保护他额外的动力吧！
- 和你的孙子对话，和他们花言巧语，让他们信任你！不像洗衣妇等角色，你的信息非常绝对，因为你只知道一个玩家和他们的角色-让他们先承认他们是谁没有好处，除非你强烈地怀疑你醉酒了。当你有机会的时候，表露出你很了解他们，你们会从一开始就建立很多信任。
- 不要向任何人透露你孙子的角色！如果邪恶的团队知道你们的关系，他们绝对会想杀了你的孙子，并带走你的生命作为一个奖赏。保守秘密以保证你们的生命的安全。
- 向几个玩家透露你的角色和你的孙子。这有两个好处——如果这些人值得信任，他们会知道反过来信任你和你的孙子。但是，如果你和你的孙子突然死了呢？你可以极大地怀疑这些玩家——有可能其中一个其实就是恶魔！（注意：如果你怀疑你在和邪恶的玩家对话，你不必告诉他们谁是你真正的孙子...）
- 使用你的信息，有许多方法可以与善良阵营玩家建立信任！鼓励有保护能力的角色来保护你的孙子。如果你知道一名玩家是旅店老板，可以让他保护孙子，或者你的孙子和茶艺师很临近，试着让你的孙子和茶艺师邻座，这样你的孙子就可以在晚上得到保护，保证你们两个的安全。同样，你可以警告像水手和驱魔人这样的玩家，他们有的会让你的孙子醉酒，或者只是在善良阵营玩家身上浪费他们的能力。最后，你可以鼓励赌徒和侍女在你或你的孙子身上使用他们的能力，当你们的信息一致时，让你们可以彼此信任！
- 如果只有你和你的孙子在晚上死去，你很可能是因为你的能力而死的。如果你怀疑是这种情况，一定要让善良阵营玩家知道，否则在晚上两个玩家的死亡就像是沙巴洛斯或珀潜伏的迹象，而事实上僵怖或普卡仍非常可能存在。
- 不要一开始就和你的孙子窃窃私语，尤其是在游戏的早期，这会吸引所有玩家的注意，恶魔可能会怀疑你们是祖母和孙子，就把你们两个干掉。
- 向团队透露你是祖母，但不要说你的孙子是哪个玩家。比如你可以简单的说“我就是祖母，我知道镇上有个驱魔人”，或者类似的话。这让团队知道你是一个镇民角色，也让他们知道并期待一个驱魔人会在之后现身。
【伪装成祖母】
当你要伪装成祖母的时候，这里有几件事你应该记住：
- 作为祖母最简单的虚张声势就是声称你是祖母，并声称一个邪恶的玩家是你的孙子。你可能不想在第一天这样做，因为大多数祖母需要一两天来透露他们的信息。等待一两天也让你的假孙子有机会告诉大家他们是谁，这样你们就可以配合他们了。或者，你可以简单地说，你是祖母，宣布一个邪恶的玩家是一个特别好的角色，并寄希望于那位邪恶玩家能理解你在做什么，并稳步地扮演成为那个角色。
- 也可以让一个善良玩家相信你是他们的祖母。如果善良玩家事先向你透露了他们的角色，或者公开透露了他们的角色，那会很容易伪装成他们的祖母。如果你知道他们的角色，你可以告诉大家同样的事情。如果你不知道他们的角色，你可以猜一猜...或者什么都不说。
- 请你的邪恶玩家同伴秘密找出善良玩家，并把这些信息反馈给你。一旦你知道了一个善良玩家的角色，而那个好玩家又不知情，那么让他们相信你是他们的祖母就容易多了。
- 扮演一名孙子！你可以自称是个善良玩家，还可以自称自己是孙子。告诉别的玩家，祖母私下找过你，你对他们完全信任。并寄希望于一个邪恶玩家会声称自己是祖母并证实你的故事。
【角色信息】
- 英文名：Grandmother
- 所属剧本：黯月初升
- 角色类型：镇民
- 角色能力类型：获取信息、进场能力、死亡触发能力、额外死亡
NewPP limit report
Cached time: 20260120025746
Cache expiry: 86400
Reduced expiry: false
Complications: []
CPU time usage: 0.031 seconds
Real time usage: 0.052 seconds
Preprocessor visited node count: 61/1000000
Post‐expand include size: 0/2097152 bytes
Template argument size: 0/2097152 bytes
Highest expansion depth: 2/40
Expensive parser function count: 0/100
Unstrip recursion depth: 0/20
Unstrip post‐expand size: 0/5000000 bytes
Transclusion expansion time report (%,ms,calls,template)
100.00%    0.000      1 -total
Saved in parser cache with key gstone_wiki:pcache:idhash:11-0!canonical and timestamp 20260120025745 and revision id 4877. Serialized with JSON.`,
  clarifications: [
    `在绝大多数情况下，祖母得知的角色都应该是善良角色。因为如果祖母得知了邪恶角色，这会带来祖母能力之外的额外信息（有处于善良阵营的邪恶角色，又或者在剧本条件不允许的情况下作为了祖母醉酒中毒的明确提示）。`,
    `相克规则：利维坦：如果利维坦在场，孙子死于处决，邪恶阵营获胜。暴乱：如果暴乱在场，孙子在白天死亡，祖母会一同死亡。`
  ],

  // 祖母的首夜需要得知孙子，我们在 setup 阶段随机指定一个善良玩家作为孙子
  onSetup: (context: { seats: Seat[]; selfId: number }) => {
    const { seats, selfId } = context;

    // 孙子必须是善良玩家（镇民或外来者），且不是祖母自己
    const goodCandidates = seats.filter((s: Seat) =>
      s.id !== selfId &&
      (s.role?.type === 'townsfolk' || s.role?.type === 'outsider')
    );

    if (goodCandidates.length > 0) {
      // 随机选一个孙子
      const randomIndex = Math.floor(Math.random() * goodCandidates.length);
      const grandchild = goodCandidates[randomIndex];

      return {
        updates: [
          { id: selfId, grandchildId: grandchild.id },
          { id: grandchild.id, isGrandchild: true }
        ],
        logs: {
          privateLog: `祖母(${selfId + 1}号)的孙子是${grandchild.id + 1}号(${grandchild.role?.name})`
        }
      } as any;
    }

    return { handled: false };
  },

  // 祖母的首夜行动：告知孙子身份
  firstNight: {
    order: 24, // 祖母在首夜较晚唤醒
    target: {
      count: { min: 0, max: 0 }
    },
    dialog: (playerSeatId: number) => ({
      wake: "祖母，请醒来。",
      instruction: "这就是你的孙子和他的角色。",
      close: "祖母，请闭眼。"
    }),
    handler: (context: NightActionContext) => {
      const { seats, selfId } = context;
      const selfSeat = seats.find((s: Seat) => s.id === selfId);

      if (selfSeat?.grandchildId !== undefined && selfSeat.grandchildId !== null) {
        const grandchild = seats.find((s: Seat) => s.id === selfSeat.grandchildId);
        if (grandchild) {
          return {
            updates: [],
            logs: {
              privateLog: `说书人告知祖母：${grandchild.id + 1}号是你的孙子，他的角色是${grandchild.role?.name}`
            }
          };
        }
      }
      return null;
    }
  }
};
