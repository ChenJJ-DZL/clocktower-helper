import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";
import { addPoisonMark, computeIsPoisoned } from "../../utils/gameRules";

/**
 * 寡妇 (Widow)
 * 首夜：查看魔典并选择一名玩家中毒；随后会有一名善良玩家得知“寡妇在场”。
 *
 * 说明：
 * - 目前仅落地“选择一名玩家：其持续中毒直到寡妇死亡”的状态标记。
 * - “查看魔典”“善良玩家得知寡妇在场”属于信息/说书人流程，暂由 UI/说书人提示处理。
 */
export const widow: RoleDefinition = {
  id: "widow",
  name: "寡妇",
  type: "minion",

  night: {
    // 仅首夜行动（实验性角色：顺序以现有系统的爪牙段落为准，先给一个稳定值）
    order: (isFirstNight) => (isFirstNight ? 12 : 0),

    target: {
      count: { min: 1, max: 1 },
      canSelect: (_target: Seat, _self: Seat) => true,
    },

    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      if (!isFirstNight) {
        return { wake: "", instruction: "", close: "" };
      }
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（寡妇）。`,
        instruction: "你可以查看魔典，然后选择一名玩家：他中毒直到寡妇死亡。",
        close: `${playerSeatId + 1}号玩家（寡妇），请闭眼。`,
      };
    },

    handler: (context) => {
      const { seats, targets, selfId, gamePhase } = context;
      if (gamePhase !== 'firstNight') {
        return { updates: [], logs: { privateLog: `寡妇（${selfId + 1}号）非首夜不行动` } };
      }
      if (targets.length !== 1) {
        return { updates: [], logs: { privateLog: `寡妇（${selfId + 1}号）未选择有效目标` } };
      }

      const targetId = targets[0];
      const targetSeat = seats.find((s) => s.id === targetId);
      if (!targetSeat) {
        return { updates: [], logs: { privateLog: `寡妇（${selfId + 1}号）选择了无效目标` } };
      }

      const { statusDetails, statuses } = addPoisonMark(targetSeat, "widow", "寡妇死亡");
      const nextSeat = { ...targetSeat, statusDetails, statuses };

      return {
        updates: [
          {
            id: targetId,
            statusDetails,
            statuses,
            isPoisoned: computeIsPoisoned(nextSeat),
          },
        ],
        logs: {
          privateLog: `寡妇（${selfId + 1}号）使${targetId + 1}号中毒（直到寡妇死亡）`,
        },
      };
    },
  },
};



