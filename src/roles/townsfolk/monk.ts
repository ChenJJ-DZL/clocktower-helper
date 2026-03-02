import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 僧侣 (Monk)
 * 说明：每个夜晚*，你要选择除你以外的一名玩家：当晚恶魔的负面能力对他无效。
 */
export const monk: RoleDefinition = {
  id: "monk",
  name: "僧侣",
  type: "townsfolk",
  detailedDescription: "每个夜晚*，你要选择除你以外的一名玩家：当晚恶魔的负面能力对他无效。\n\n**运作方式:**\n除首个夜晚外的每个夜晚，唤醒僧侣。让僧侣指向任意一名除自己以外的玩家。被选择的玩家受到保护——将“被保护”提示标记放置在那名玩家的角色标记旁。让僧侣重新入睡。\n在当晚接下来的时间里，如果恶魔以此玩家作为目标或是由于其他原因波及到了该玩家，其能力不会对此玩家产生效果。（在黎明时，可能因为保护成功而导致当晚无人死亡，在这种情况下，只宣布当晚没有人死亡。）\n恶魔不知道哪一名玩家受到了保护。\n\n**提示与技巧:**\n- 如果恶魔试图杀死你保护的人，恶魔将不会取得任何战果。虽然你不知道是谁做的，但那个人会安然无恙地活过这个夜晚。这能给善良阵营带来巨大优势。\n- 如果恶魔在晚上没杀到人，第二天早上你们就会多一名存活玩家帮你做出表决，而且好人阵营还多了一轮处决机会来找到恶魔！这也就是为什么你是恶魔的头号目标。如果你让别人知道你是僧侣，你活不过今晚的。最好的掩护就是告诉所有人你根本不是僧侣。\n- 不说自己是个僧侣可能会是个问题。如果你想用自己的能力验证另一名玩家的身份，你最好的办法就是私下找他并且向他证明自己。注意只告诉那些你绝对信任的人，或者等最后几天再坦白。\n- 把你的保护能力用在能够获取信息的角色上，比如占卜师、送葬者或者共情者。这些角色是恶魔的首要目标，恶魔越想杀他们，你就应该越常保护他们。\n- 与其集中保护一个人整场游戏，不如每晚保护不同的人。如果恶魔知道你每晚都在保护同一人，他就会转而去杀其他角色。但是恶魔不知道你昨晚保护的是不是同一个人，这就会让他难以抉择。",
  clarifications: [
    "在其他剧本里，如果恶魔试图给受到保护的玩家施加其他负面效果（如中毒、转变为邪恶阵营等），这些效果也会无效。",
    "如果他们已经受到了其他负面效果，僧侣的能力也不会将其消除（例如已经中的毒依然还在，只是今晚恶魔杀不死他了）。",
    "相克规则：利维坦：如果利维坦在场，僧侣保护玩家免受利维坦处决的影响。暴乱：如果暴乱在场，僧侣保护玩家免受暴乱提名的影响。"
  ],
  night: {
    order: (isFirstNight) => (isFirstNight ? 80 : 80),
    target: {
      count: { min: 1, max: 1 },
      canSelect: (target: Seat, self: Seat) => {
        // 不能选自己；默认只允许选择存活玩家
        return target.id !== self.id && !target.isDead;
      },
    },
    dialog: (playerSeatId: number) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（僧侣）。`,
        instruction: "请选择一名其他存活玩家进行保护（当晚恶魔无法杀死他）。",
        close: `${playerSeatId + 1}号玩家（僧侣），请闭眼。`,
      };
    },
    handler: (context) => {
      const { seats, targets, selfId } = context;

      if (targets.length !== 1) {
        return {
          updates: [],
          logs: {
            privateLog: `僧侣（${selfId + 1}号）未选择有效目标`,
          },
        };
      }

      const targetId = targets[0];
      const targetSeat = seats.find((s) => s.id === targetId);

      if (!targetSeat) {
        return {
          updates: [],
          logs: {
            privateLog: `僧侣（${selfId + 1}号）选择了无效目标`,
          },
        };
      }

      const statusDetails = [...(targetSeat.statusDetails || []), "僧侣保护"];
      const statuses = [
        ...(targetSeat.statuses || []),
        { effect: "Protected", duration: "至天亮", sourceId: selfId },
      ];

      return {
        updates: [
          {
            id: targetId,
            isProtected: true,
            protectedBy: selfId,
            statusDetails,
            statuses,
          },
        ],
        logs: {
          privateLog: `僧侣（${selfId + 1}号）保护了${targetId + 1}号玩家`,
        },
      };
    },
  },
};
