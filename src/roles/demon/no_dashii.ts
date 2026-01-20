import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 诺-达鲺 (No Dashii)
 * 每晚选一名玩家：他死亡。
 * 与你邻近的两名镇民中毒（总是最近的两名镇民，跳过非镇民；当你死亡或失去能力时，这两名镇民恢复健康）。
 *
 * 说明：
 * - 中毒邻居的选择与持续时间的细节在统一的 demon/killPlayer 流程与中毒计算中处理；
 * - 这里仅用于夜晚顺位 & UI 交互（目标数量 / 提示文案）。
 */
export const no_dashii: RoleDefinition = {
  id: "no_dashii",
  name: "诺-达",
  type: "demon",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 2 : 6,
    
    target: {
      count: {
        // 每晚必须选择 1 名玩家作为攻击目标
        min: 1,
        max: 1,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（诺-达）。`,
        instruction: "请选择一名玩家杀死。与你邻近的两名镇民会持续中毒，直到你失去能力或离场。",
        close: `${playerSeatId + 1}号玩家（诺-达），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `诺-达（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
