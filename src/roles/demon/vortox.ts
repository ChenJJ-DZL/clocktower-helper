import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 涡流 (Vortox)
 * 每晚选一名玩家：他死亡。
 * 镇民玩家的能力都会产生错误信息；若白天无人被处决（不含流放），邪恶阵营立即获胜。
 *
 * 说明：
 * - 信息“必假”与“白天无人处决即邪恶胜利”的裁定在统一的夜晚信息生成与日落阶段逻辑中处理；
 * - 这里仅用于夜晚顺位 & UI 交互（目标数量 / 提示文案）。
 */
export const vortox: RoleDefinition = {
  id: "vortox",
  name: "涡流",
  type: "demon",

  night: {
    order: (isFirstNight) => isFirstNight ? 2 : 7,

    target: {
      count: {
        min: 1,
        max: 1,
      },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（涡流）。`,
        instruction: "请选择一名玩家杀死。请记住：只要你存活，所有镇民通过能力获得的信息都会是错误的；若今天白天无人被处决，邪恶阵营将立即获胜。",
        close: `${playerSeatId + 1}号玩家（涡流），请闭眼。`,
      };
    },

    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `涡流（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
