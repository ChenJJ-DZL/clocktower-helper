import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 教授 (Professor)
 * 说明：每局游戏限一次，你可以在夜晚选择一名已死亡的善良玩家：他立刻复活。
 */
export const professor: RoleDefinition = {
  id: "professor",
  name: "教授",
  type: "townsfolk",

  night: {
    order: (isFirstNight) => isFirstNight ? 0 : 14,

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
        wake: `唤醒${playerSeatId + 1}号玩家（教授）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（教授），请闭眼。`,
      };
    },

    handler: (context) => {
      // Logic handled in game controller/roleActionHandlers for revival
      return {
        updates: [],
        logs: {
          privateLog: `教授（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
