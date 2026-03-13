import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";
import { getRegistration, getRandom } from "../../utils/gameRules";

/**
 * 筑梦师 (Dreamer)
 *
 * 每个夜晚，你要选择除你及旅行者以外的一名玩家：
 * - 你会得知一个善良角色和一个邪恶角色，其中一个是该玩家的真实角色；
 * - 具体哪两个角色、谁真谁假，以及在涡流 / 醉酒 / 中毒下如何扭曲，由统一的 `nightLogic` 信息管线处理；
 * - 这里仅负责夜晚顺位、可选目标限制与 UI 提示。
 */
export const dreamer: RoleDefinition = {
  id: "dreamer",
  name: "筑梦师",
  type: "townsfolk",
  detailedDescription: `【背景故事】
“我记得有钟表匠……天空是红色的，有不规则的三角形不断从天上坠落下来。有紫罗兰的气味……还有气泡咕嘟咕嘟的声音。一个眼睛发光、还有着乱糟糟的胡须的女人对着天空发出嘶嘶声。然后，我醒了……”
【角色能力】
每个夜晚，你要选择除你及旅行者以外的一名玩家：你会得知一个善良角色和一个邪恶角色，该玩家是其中一个角色。
【角色简介】
筑梦师能得知一名玩家可能对应的角色，但不能确认哪个是正确的。
- 每个夜晚，筑梦师需要选择一名其他玩家，并得知一个善良角色与一个邪恶角色，其中一个是那名玩家的真实角色。
- 筑梦师得知的错误角色标记取决于所选玩家的真正的角色类型。如果筑梦师选择的玩家是镇民或外来者，对应的错误的邪恶角色可以是爪牙或恶魔。如果筑梦师选择的玩家是爪牙或恶魔，对应的错误的善良角色可以是镇民或外来者。
- 筑梦师不能选择自己和旅行者作为目标。
【范例】
> 范例: 筑梦师选择一名玩家，该玩家是畸形秀演员。筑梦师得知该玩家是畸形秀演员或洗脑师。
> 范例: 筑梦师选择了一名获得了卖花女孩能力的哲学家。筑梦师得知该玩家要么是哲学家，要么是亡骨魔。
> 范例: 在白天，镜像双子和艺术家都声称自己是艺术家。在那天晚上，筑梦师选择了镜像双子。如果说书人想帮助善良阵营，他可以给筑梦师展示这两个角色：镜像双子和心上人。反之，他可以给筑梦师镜像双子和艺术家这两个角色。
> 范例: 筑梦师选择了一名玩家，他的真实角色是涡流。因为涡流的能力效果，筑梦师获得的信息必须是错误的。所以筑梦师得到这个玩家的角色是神谕者或诺-达鲺。
【运作方式】
每个夜晚，唤醒筑梦师。让他指向除自己和旅行者外的任意一名玩家。如果被选择的玩家的真实角色是镇民或外来者，向筑梦师展示他的真实角色和任意一个爪牙或恶魔角色标记。如果被选择的玩家的真实角色是爪牙或恶魔，则给筑梦师展示他的真实角色和任意一个镇民或外来者角色标记。让筑梦师重新入睡。
> 范例: 如果筑梦师选择了一名邪恶玩家，你能通过这种方式来帮助邪恶阵营：你可以给筑梦师展示邪恶玩家正在伪装的虚假角色，或者展示一些需要隐藏自己的角色，例如舞蛇人、贤者、畸形秀演员或呆瓜。
【提示标记】
无
【提示与技巧】
- 每次你选择一名玩家，你就会得知他潜在的一种邪恶角色的可能性。请关注这些信息，因为这会给你带来惊人的信息量，哪怕这是错误的信息。例如，任何潜在角色是爪牙的玩家将不太可能是恶魔，所以你可以将他们从你嫌疑名单上划掉。
- 你的信息可以绝佳的辨识出是否受到涡流或诺-达鲺影响，因为和其他玩家不同，你的信息可以非常容易证实是否正确。如果你得知的一名玩家的信息不太合理，那么你就要保持怀疑了。如果你得到更多玩家的信息都不合理？那么你就要寻找其他的可能性。
- 试着去选择没有和你邻座的玩家。如果你和诺-达鲺邻座，你就会中毒，那么你的信息就会对于恶魔有利。通过选择离你更远的玩家，你会选中邪恶玩家获得关于他们的不可靠信息的可能性就会小的多。（当然你仍然可以在后续去选择你的邻座玩家）
- 在游戏早期提供你的信息将更有帮助。很少有玩家会直接公布他的角色，因为邪恶玩家们需要时间来配合，那么你就有绝佳的时机来证实你是一个善良玩家。
- 当与你选择的玩家交换信息的时候，谨慎于先透露你的信息。如果你对一名邪恶玩家这么做，那么很可能你会给他提供一个可能伪装的角色。取而代之的是，让他透露他的角色给你，来看是否与你的信息匹配
- 如果你选择在交换信息时先透露你的信息，那么这将很明确的证实你的筑梦师角色……提供你的消息当然也是不错的选择。这将使对方对你有更多的信任，因为除此之外很难获取这样的信息。
- 鼓励玩家们不要过早的揭示自己的角色。如果有人声明了他的角色，你仍然可以去做检查，但是如果所有人都公开了他们的角色，那你就很难去证明自己了。
- 相比于你认为说了真话的玩家，可以去检查那些你认为在说谎的玩家。将玩家从谎言中抓出的体验是很棒的，因为你会得知这个邪恶玩家的角色，如果你想让他死去，你可以立即公布这个信息。
- 可以选择你认为说真话的玩家；不仅这让他更受到支持，而且如果你发现你的信息错误，你可以去怀疑是否有什么其他原因导致了这一切。
- 你永远不会得到涡流这个角色，因为如果涡流在场你必定获得错误信息。
- 如果场上有一对镜像双子角色，不用去检查他们。你很可能会得到镜像双子中善良与邪恶的角色……这将毫无用处。有一个例外：你可以借此发现是否有涡流在场。
【伪装成筑梦师】
当你要伪装成筑梦师的时候，这里有几件事你应该记住：
- 第一天是最艰难的。如果你第一天很早就透露了你是谁。你需要再别人透露他们角色前透露他们的角色。如果你选择一个邪恶同伴，寄希望于他能配合你来使你伪装这个角色，这将容易很多。如果你是恶魔这将会特别成功，因为你知道3个不在场的善良角色。例如，你声明自己是筑梦师，然后声明你的爪牙是城镇公告员或者方古，如果他声明自己是城镇公告员，那么这会使你看起来确实是筑梦师。
- 如果你选择了一名玩家，但不知道他的角色是什么，去鼓励他们透露他们的角色，然后故作明智的点点头说"和我预期的一样"，或者用别的什么方式去确认他的角色。善良玩家很少会伪装自己的角色，所以经常会在简单的阐述或被提名时就透露自己的角色。
- 假装去选择那些已经透露角色的玩家。这样，你可以使你在那些玩家眼中是善良的。例如，相比于告诉钟表匠他是杂耍艺人或女巫，如果你告诉他他是钟表匠或亡骨魔，那么钟表匠更可能会认为你是善良的。
- 如果你想让善良阵营看起来可疑，哪怕自己受到怀疑的风险，那么你可以这样做来降低自己的风险，告诉大家你知道他的角色是一个很神秘的角色，一个不想向大家透露自己的角色，比如贤者、畸形秀演员、心上人或呆瓜等。即使这名善良玩家否认自己是其中之一，但善良玩家们会可能认为你确实是那个得到有用信息的筑梦师。
- 如果你声明一个玩家是某一爪牙，那么请确保你知道有哪些爪牙在场，这些爪牙通常是想要去提供的。例如，如果只有一个爪牙在场，而有人由于提名死去，所有人都知道那个爪牙是女巫。如果你声明某一个玩家是卖花女孩或洗脑师并不会使你得到大家的信任。说书人通常应该向筑梦师展示在场的爪牙以便迷惑他。
- 当提供一个善良玩家的信息时，优先透露他们可能是恶魔而不是爪牙。因为善良玩家们更可能去怀疑谁可能是恶魔然后更有可能去处决他们。
- 当提供关于邪恶玩家的信息时，优先透露他们可能是爪牙。因为善良玩家们相比处决恶魔或爪牙，更倾向于处决可能是恶魔的玩家。
- 等待几天再表明自己的筑梦师角色。这会给你足够的时间来把事情讲清楚。
- 绝对不要说你得知一名玩家可能是涡流！因为如果涡流在场，你的信息必然会是错的。
【角色信息】
- 英文名：Dreamer
- 所属剧本：梦殒春宵
- 角色类型：镇民
- 角色能力类型：获取信息
- 角色背景相关：在筑梦师的梦境里，依次出现了：钟表匠、数学家、卖花女孩、麻脸巫婆、女巫。
其他称呼（非官方，仅方便索引用）：入梦人、梦卜者、空想家、梦想家
NewPP limit report
Cached time: 20260119175950
Cache expiry: 86400
Reduced expiry: false
Complications: []
CPU time usage: 0.030 seconds
Real time usage: 0.050 seconds
Preprocessor visited node count: 56/1000000
Post‐expand include size: 0/2097152 bytes
Template argument size: 0/2097152 bytes
Highest expansion depth: 2/40
Expensive parser function count: 0/100
Unstrip recursion depth: 0/20
Unstrip post‐expand size: 0/5000000 bytes
Transclusion expansion time report (%,ms,calls,template)
100.00%    0.000      1 -total
Saved in parser cache with key gstone_wiki:pcache:idhash:37-0!canonical and timestamp 20260119175950 and revision id 3046. Serialized with JSON.`,

  night: {
    order: (isFirstNight) => isFirstNight ? 8 : 8,

    target: {
      count: {
        // 每晚必须选择 1 名目标（除自己与旅行者外）
        min: 1,
        max: 1,
      },
      canSelect: (target: Seat, self: Seat) => {
        if (!target.role) return false;
        if (target.id === self.id) return false;
        if (target.role.type === 'traveler') return false;
        return true;
      },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（筑梦师）。`,
        instruction: "请选择除你及旅行者以外的一名玩家，说书人会告知你：一个善良角色和一个邪恶角色，其中一个是该玩家的真实角色。",
        close: `${playerSeatId + 1}号玩家（筑梦师），请闭眼。`,
      };
    },

    // 真正的信息生成与真假角色对由 nightLogic 处理，这里只做日志记录
    handler: (context) => {
      const { targets, seats, roles, selfId, isVortoxWorld, shouldShowFake, getMisinformation } = context;
      if (targets.length !== 1) {
        // This should be caught by target validation, but as a fallback:
        return { updates: [], logs: { privateLog: "筑梦师必须选择且仅选择一名玩家" } };
      }

      const targetId = targets[0];
      const targetSeat = seats.find(s => s.id === targetId);
      if (!targetSeat || !targetSeat.role) {
        return { updates: [], logs: { privateLog: `无效目标: ${targetId}` } };
      }

      const actualRole = targetSeat.role;
      const reg = getRegistration(targetSeat, { id: 'dreamer' } as any);
      let isGoodReg = reg.alignment === 'Good';

      // Vortox world inverts townsfolk info. If dreamer is a townsfolk and not disabled, their info is wrong.
      if (isVortoxWorld) {
        isGoodReg = !isGoodReg;
      }
      
      // Handle poison/drunk fake info
      if (shouldShowFake) {
        isGoodReg = !isGoodReg;
      }

      const townsfolk = roles!.filter(r => r.type === 'townsfolk');
      const outsiders = roles!.filter(r => r.type === 'outsider' || r.id === 'drunk');
      const minions = roles!.filter(r => r.type === 'minion');
      const demons = roles!.filter(r => r.type === 'demon');

      const goodRoles = [...townsfolk, ...outsiders];
      const evilRoles = [...minions, ...demons];

      let roleA: Role;
      let roleB: Role;

      if (isGoodReg) {
        const correctGoodRole = (actualRole.type === 'townsfolk' || actualRole.type === 'outsider' || actualRole.id === 'drunk')
          ? actualRole
          : getRandom(goodRoles);
        roleA = correctGoodRole;
        roleB = getRandom(evilRoles);
      } else {
        const correctEvilRole = (actualRole.type === 'minion' || actualRole.type === 'demon')
          ? actualRole
          : getRandom(evilRoles);
        roleA = getRandom(goodRoles);
        roleB = correctEvilRole;
      }
      
      // Randomize position
      if (Math.random() < 0.5) {
        [roleA, roleB] = [roleB, roleA];
      }

      return {
        updates: [],
        logs: {
          privateLog: `筑梦师选择了${targetId + 1}号位，得知：${roleA.name}, ${roleB.name}`,
          secretInfo: `得知：${roleA.name}, ${roleB.name}`
        },
        modal: {
          type: 'DREAMER_RESULT',
          data: {
            roleA: roleA,
            roleB: roleB
          }
        }
      };
    },
  },
};
