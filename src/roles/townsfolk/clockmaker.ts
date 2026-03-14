import type {
  NightActionContext,
  RoleDefinition,
} from "../../types/roleDefinition";

/**
 * 钟表匠 (Clockmaker)
 *
 * 在你的首个夜晚，你会得知恶魔与爪牙之间最近的距离（邻座为 1）。
 * - 只在首夜获得一次信息，之后不再唤醒；
 * - 距离按环形座位计算，取所有“恶魔-爪牙”组合中的最小值；
 */
export const clockmaker: RoleDefinition = {
  id: "clockmaker",
  name: "钟表匠",
  type: "townsfolk",
  detailedDescription: `【背景故事】
“不要打扰我。时钟的滴答声必须延续下去，它的每一圈循环都象征着生命，它的每一圈循环都包含着世间万物——世间的所有答案——它是一个无比神圣的机器。好了，我必须工作了。”
【角色能力】
在你的首个夜晚，你会得知恶魔与爪牙之间最近的距离。（邻座的玩家距离为1）
【角色简介】
钟表匠能得知恶魔与爪牙之间最近的距离。
- 钟表匠只在第一个夜晚得知该信息。
- 距离指代恶魔与爪牙之间坐着的玩家数量，从恶魔旁边的玩家开始，到最近的爪牙结束，顺时针或逆时针均可。
【范例】
> 范例: 方古坐在麻脸巫婆旁边。钟表匠得知了“1”。
> 范例: 诺-达鲺顺时针方向依次坐着筑梦师、舞蛇人，然后是镜像双子。诺-达鲺逆时针方依次坐着畸形秀演员、心上人、哲学家、贤者，然后是女巫。因为女巫与恶魔的距离为五，而镜像双子与恶魔的距离为三，所以钟表匠得知了“3”。
> 范例: 方古与两名旅行者相邻，一善一恶。洗脑师与其中一名旅行者相邻。在第一个晚上，钟表匠得知了“2”，因为邪恶的旅行者不是爪牙。
【运作方式】
在第一个夜晚，唤醒钟表匠。对他用手势比划数字来表示恶魔与爪牙之间最近的距离(1，2，3等）。让钟表匠重新入睡。
【提示标记】
无

【提示与技巧】
- 你不必立即提供你的信息；等待一两天以便你可以在邪恶阵营放松警惕的时候观察其他玩家来发现可疑之处。
- 如果你能找出一个爪牙那么你的信息将会变得非常有用。弄清楚谁是爪牙，你就可以确定谁更有嫌疑是恶魔。你需要和其他善良角色合作尝试揭露真相。许多玩家有着辨识出邪恶阵营的能力（如神谕者和女裁缝）或是辨识恶魔与爪牙的能力（如卖花女孩、城镇公告员甚至是舞蛇人）。
- 如果你得到一个特别大的数字（＞3），那么爪牙们很可能坐的很近并离恶魔很远。同样的如果你得到一个很小的数字（＜2），那么其中一个爪牙里恶魔的距离很近。你可以利用这些信息来观察他们是否有对话，或有其他玩家的互动与你的信息匹配。
- 如果你有怀疑是恶魔的对象，你可以利用你的信息来寻找可能是爪牙的玩家，然后观察他们，他们提供的信息以及有什么信息是关于他们的。相比于恶魔（知道三个不在场角色）爪牙们倾向于努力的隐藏自己，你可以好好利用爪牙们的弱点来确认谁是恶魔。
- 你的信息将随着游戏推进以及玩家逐渐死亡变得越发的有用。由于邪恶的玩家不太可能会在夜晚时死去，他们往往想要活的更长来互相支持对方以及他们的观点，因此他们相比于游戏开始时会变得越来越容易暴露。观察仍然活着的玩家中是否能匹配你的信息；如果他们在暗中支持对方，那么他们很有可能是潜藏的邪恶玩家。
- 所有你即将面对的爪牙都有明显的表现，也就是说即使他们死了，也会有明显的现象。如果你注意到突然间没有人再因为女巫诅咒而死，被洗脑师洗脑，或者因为麻脸巫婆改变角色，那么很有可能你们已经处决了这些爪牙。弄清楚这些可以让你回推出谁会是恶魔！镜像双子是一个例外，因为你通常会在很早的时候就得知他们在场。这也意味着你可能在很早就确定（最多）四个有可能是恶魔的玩家。
【伪装成钟表匠】
当你要伪装成钟表匠的时候，这里有几件事你应该记住：
- 作为钟表匠，最普通也最简单的伪装方法就是在第一天的时候告诉大家错误的信息。因为你知道恶魔和爪牙之间相互的距离，而这个错误的信息很可能在几天里使善良阵营的玩家们陷入困惑。请记住"1"表示恶魔和爪牙相邻。
- 提供正确的钟表匠信息实际上对于邪恶阵营也非常有帮助。如果大家认为你是善良的，选择相信你的信息，那么他们可能就不会在使用钟表匠信息的时候把你当做是爪牙或者恶魔，也因此他们无法发现谁实际上会是恶魔。如果他们认为你是邪恶的，那么他们很有可能会认为你给出的是错误的信息，因此也会阻碍他们找到真正的恶魔。
- 如果你是恶魔选择要伪装成钟表匠，那么在第一天活下来显得尤为重要。作为梦殒春宵中唯一一个在首夜就能得到信息的角色，并且无法再获取任何信息，善良阵营的玩家们将更倾向于在第一天将钟表匠处决掉。等到第二天或之后，你再揭示你钟表匠的角色，将有助于你从游戏早期、风险更大的时期中活下来。
- 提供假信息时，选择提供小数字可能更好。如果你提供的数字快要到人数的一半了，这就暗示了恶魔和爪牙实际基本面对面而坐了。此外，如果本局有多个爪牙，那么较大的数字就意味着这些爪牙都坐在一起了，而玩家们很可能不会相信这一点。较小的数字可以和较大数字一样令人困惑。所以，请慎重考虑你将要选择的数字。
- 由于善良阵营的玩家们很容易通过爪牙能力所表现的现象消失来推测谁是爪牙，所以在夜晚杀死爪牙不是一个明智的选择。例如，善良阵营的玩家会认为他们处决了麻脸巫婆（因为他们发现没有人再发生角色改变），那么去杀死可能证明或反驳你的钟表匠信息的会是恶魔的玩家会让你很难受，然而如果你在晚上杀死了麻脸巫巫婆，那么善良玩家们更倾向于认为他们在白天确实处决了麻脸巫婆。这可能会帮助或阻碍你的目标，取决于善良玩家们相信什么，尤其是是否相信涡流在场。
【角色信息】
- 英文名：Clockmaker
- 所属剧本：梦殒春宵
- 角色类型：镇民
- 角色能力类型：获取信息、进场能力
NewPP limit report
Cached time: 20260119184652
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
Saved in parser cache with key gstone_wiki:pcache:idhash:26-0!canonical and timestamp 20260119184652 and revision id 4896. Serialized with JSON。`,
  clarifications: [
    "当钟表匠即将被唤醒之前，说书人会根据当前场上的情况给出实时的信息。这意味着钟表匠得知的信息可能会与游戏初始时的情况有所不同，因为有一些角色的能力能够在游戏的过程中改变玩家的角色（如麻脸巫婆和理发师等）。",
    "钟表匠在获得信息时，说书人需要每次抽取两名玩家（其中一名为恶魔，另一名为爪牙，必须是两名不同的玩家）进行距离计算，直到将场上所有的“恶魔-爪牙”组合遍历完毕。这一过程类似于厨师，会进行多次判断，因此某些角色可能会在不同的玩家组合中被当作为不同的结果（如间谍、陌客、照看小怪宝的爪牙等）。最后，说书人会将这些距离值中的最小值作为信息提供给钟表匠。",
    "在计算距离时，距离值等同于：恶魔与爪牙这两名玩家之间的玩家数量+1。因此，钟表匠能得知的最小数字为“1”。（然而，在极端情况下，如果场上缺乏某种类型的角色，如无恶魔或无爪牙的时候，钟表匠会得知“0”。）",
    "在抽取两名玩家的组合时，即使是已死亡的玩家也依然会被钟表匠进行探查。",
    "相克规则：召唤师：如果召唤师在场，在创造恶魔之后钟表匠才会得知信息。",
  ],

  night: {
    order: (isFirstNight) => (isFirstNight ? 4 : 0),

    target: {
      count: {
        min: 0,
        max: 0,
      },
    },

    dialog: (
      playerSeatId: number,
      isFirstNight: boolean,
      _context: NightActionContext
    ) => {
      if (!isFirstNight) {
        return { wake: "", instruction: "", close: "" };
      }
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（钟表匠）。`,
        instruction:
          "说书人将用手势告知：恶魔与任一爪牙之间最近的距离（邻座为1）。",
        close: `${playerSeatId + 1}号玩家（钟表匠），请闭眼。`,
      };
    },

    handler: (context: NightActionContext) => {
      const { seats, gamePhase, selfId } = context;
      if (gamePhase !== "firstNight") {
        return null;
      }

      // Jinx: If Summoner is in play, they are considered a demon.
      const summonerInPlay = seats.some((s) => s.role?.id === "summoner");

      const demons = seats.filter(
        (s) =>
          s.role?.type === "demon" ||
          (summonerInPlay && s.role?.id === "summoner")
      );
      const minions = seats.filter((s) => s.role?.type === "minion");

      if (demons.length === 0 || minions.length === 0) {
        return {
          updates: [],
          logs: {
            privateLog: `钟表匠（${selfId + 1}号）得知距离为 0（无恶魔或爪牙）。`,
          },
          speak: ["说书人手势：0"],
        };
      }

      let minDistance = seats.length;

      for (const demon of demons) {
        for (const minion of minions) {
          if (demon.id === minion.id) continue;
          const diff = Math.abs(demon.id - minion.id);
          const distance = Math.min(diff, seats.length - diff);
          if (distance < minDistance) {
            minDistance = distance;
          }
        }
      }

      return {
        updates: [],
        logs: {
          privateLog: `钟表匠（${selfId + 1}号）得知恶魔与爪牙的最近距离为 ${minDistance}`,
        },
        speak: [`说书人手势：${minDistance}`],
      };
    },
  },
};
