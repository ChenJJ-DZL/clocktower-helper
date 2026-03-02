import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 管家 (Butler)
 * 每个夜晚，你要选择除你以外的一名玩家：明天白天，只有他投票时你才能投票。
 * 
 * 规则要点：
 * - 每个夜晚，管家需要选择一名玩家来成为自己的主人
 * - 如果主人在投票时举手，或主人的投票已经被统计时，管家可以举手参与投票
 * - 如果主人放下了他的手，表明他不参与投票，或在投票被统计前将手放下，管家也必须将自己的手放下
 * - 说书人没有监视管家的责任，管家需要为自己的投票负责
 * - 因为角色能力不能以任何形式影响流放流程，管家可以在流放表决中自由参与表决
 * - 已死亡的玩家只能在拥有投票标记时才能举手投票
 * - 管家的能力从不会被强制必须投票
 * - 管家的投票可以在他主人之前或之后被说书人计票，座次顺序并不重要
 */
export const butler: RoleDefinition = {
  id: "butler",
  name: "管家",
  type: "outsider",
  detailedDescription: "每个夜晚，你要选择除你以外的一名玩家：明天白天，只有他投票时你才能投票。\n\n**运作方式:**\n每个夜晚，唤醒管家。让管家指向除自己外的任意一名玩家。用“主人”提示标记来标记这名玩家。让管家重新入睡。\n在一次提名中，管家只能在主人举手投票，或主人的投票已经被统计时，才能举手投票。\n\n**提示与技巧:**\n- 你的投票依然正常计数，但主人不举手你不能投票。仔细听场上发言并找出善良阵营。如果你的主人是善良的，你就可以投出有意义的一票。\n- 你的主人不投票，你就不可以投票，但是这不意味着在他投票时你必须投票。记得只去投那些你认为是邪恶阵营的玩家。\n- 被你选做主人的玩家通常会相信你并希望你存活。如果有人要提名你，这种信任会帮助到你。\n- 你可以选择一名死亡玩家作为你的主人。但是要小心——因为死亡玩家仅剩一票可用了，他可能暂时不用这一票，意味着你可能根本没机会投票。\n- 如果你想胁迫你的主人投一个你想投的玩家，你可以威胁他说如果他不投票你就要换主人了。",
  clarifications: [
    "如果管家不小心进行了违规投票，说书人仍会统计管家的票（不在台面上揭穿管家），并在稍后私下提示管家。",
    "因为角色能力不能以任何形式影响流放流程，管家可以在流放旅行者的表决中自由参与表决",
    "已死亡的玩家只能在拥有投票标记时才能举手投票。如果管家选择了一名已死亡玩家作为主人，此时仍然必须主人行使仅有的一票时管家才能投票。",
    "管家的投票可以在他主人之前或之后被说书人计票。座次顺序并不重要。",
    "相克规则：食人族：如果食人族获得了管家的能力，他会得知这一信息。街头风琴手：如果街头风琴手使得玩家需要闭眼投票，管家可以自由举手投票，但只在他的主人投票时他的票才会被统计。"
  ],
  night: {
    order: 15,
    target: {
      count: { min: 1, max: 1 },
      canSelect: (target: Seat, self: Seat, allSeats: Seat[], selectedTargets: number[]) => {
        // 不能选自己
        if (target.id === self.id) {
          return false;
        }
        // 可以选择已死亡的玩家（如果他有投票标记）
        return true;
      },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（管家）。`,
        instruction: "选择你的主人（除你以外的任意一名玩家）",
        close: `${playerSeatId + 1}号玩家（管家），请闭眼。`,
      };
    },

    handler: (context) => {
      const { seats, targets, selfId } = context;

      if (targets.length !== 1) {
        return {
          updates: [],
          logs: {
            privateLog: `管家（${selfId + 1}号）未选择有效目标`,
          },
        };
      }

      const targetId = targets[0];
      const targetSeat = seats.find(s => s.id === targetId);

      if (!targetSeat) {
        return {
          updates: [],
          logs: {
            privateLog: `管家（${selfId + 1}号）选择了无效目标`,
          },
        };
      }

      // 更新管家状态：设置主人
      // 注意：如果管家醉酒中毒，不放置"主人"标记
      const selfSeat = seats.find(s => s.id === selfId);
      const isDrunkOrPoisoned = selfSeat?.isDrunk || selfSeat?.isPoisoned;

      const updates: Array<Partial<Seat> & { id: number }> = [];

      if (!isDrunkOrPoisoned) {
        // 移除旧的"主人"标记（如果有）
        const currentStatusDetails = (selfSeat?.statusDetails || []).filter(
          (detail: string) => !detail.includes("主人") && !detail.includes(`主人:${targetId + 1}`)
        );

        updates.push({
          id: selfId,
          masterId: targetId,
          statusDetails: [...currentStatusDetails, `主人:${targetId + 1}`],
        });

        return {
          updates,
          logs: {
            privateLog: `管家（${selfId + 1}号）选择了${targetId + 1}号玩家作为主人`,
          },
        };
      } else {
        return {
          updates,
          logs: {
            privateLog: `管家（${selfId + 1}号）醉酒中毒，不放置主人标记`,
          },
        };
      }
    },
  },
};

