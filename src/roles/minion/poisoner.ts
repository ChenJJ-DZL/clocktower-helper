import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";
import { addPoisonMark, computeIsPoisoned, isEvil } from "../../utils/gameRules";

/**
 * 投毒者 (Poisoner)
 * 每晚选一名玩家中毒，中毒者获得错误信息
 */
export const poisoner: RoleDefinition = {
  id: "poisoner",
  name: "投毒者",
  type: "minion",
  detailedDescription: "每个夜晚，你要选择一名玩家：他在当晚和明天白天中毒。\n\n**运作方式:**\n每个夜晚，唤醒投毒者。让投毒者指向任意一名玩家。被选择的玩家中毒。每到黄昏时，中毒玩家会恢复健康。\n\n**提示与技巧:**\n- 像占卜师和送葬者这样在晚上能获得信息的角色都是不错的下毒选择。\n- 也可以基于玩家来做出你的选择；那些对于善良阵营有强领导力和号召力的玩家或者一直保持安静不想引起注意的玩家都是很好的选项。\n- 给贞洁者、猎手或镇长这样的角色下毒也很棒，但前提是他们刚好能在中毒期间触发能力。因此你需要在适当的时候去说服他们使用能力。\n- 每晚选择不同的目标下毒要比整场都盯着一个玩家下毒要更有效。\n- 在第一天晚上，如果你不知道毒谁，就毒那个坐在恶魔旁边的人。因为大概率会废掉共情者的信息。",
  clarifications: [
    "中毒的玩家会失去能力，但说书人会装作他仍具有能力。他的能力不会真实地影响游戏。如果那个镇民能力会获取信息，说书人可以（且建议）给他提供错误信息。",
    "如果一名中毒的玩家在他中毒的期间里使用了“每局游戏限一次”的能力，他无法再次使用这项能力。"
  ],

  // 投毒者首夜和后续夜晚都行动
  night: {
    order: (isFirstNight) => isFirstNight ? 1 : 1,

    target: {
      count: {
        min: 1,
        max: 1,
      },

      canSelect: (target: Seat, self: Seat, allSeats: Seat[], selectedTargets: number[]) => {
        // 可以选任何人（包括自己）
        return true;
      },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（投毒者）。`,
        instruction: "请选择一名玩家进行下毒。",
        close: `${playerSeatId + 1}号玩家（投毒者），请闭眼。`,
      };
    },

    handler: (context) => {
      const { seats, targets, selfId } = context;

      if (targets.length !== 1) {
        // 无效目标数量
        return {
          updates: [],
          logs: {
            privateLog: `投毒者（${selfId + 1}号）未选择有效目标`,
          },
        };
      }

      const targetId = targets[0];
      const targetSeat = seats.find(s => s.id === targetId);

      if (!targetSeat) {
        return {
          updates: [],
          logs: {
            privateLog: `投毒者（${selfId + 1}号）选择了无效目标`,
          },
        };
      }

      // 防呆设计：如果误选了邪恶阵营玩家，必须中断动作并弹出二次警告确认框
      if (!context.isConfirmed && isEvil(targetSeat)) {
        return {
          updates: [],
          modal: {
            type: 'POISON_EVIL_CONFIRM',
            data: { targetId }
          }
        };
      }

      // 投毒：当晚 + 次日白天中毒，黄昏清除
      const { statusDetails, statuses } = addPoisonMark(
        targetSeat,
        'poisoner',
        '次日黄昏清除'
      );

      const updates: Array<Partial<Seat> & { id: number }> = [
        {
          id: targetId,
          statusDetails,
          statuses,
          isPoisoned: computeIsPoisoned({ ...targetSeat, statusDetails, statuses }),
        },
      ];

      return {
        updates,
        logs: {
          privateLog: `投毒者（${selfId + 1}号）对${targetId + 1}号玩家下毒`,
        },
      };
    },
  },
};

