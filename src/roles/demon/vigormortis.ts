import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 亡骨魔 (Vigormortis)
 * 每晚选一名玩家：他死亡。
 * 被你杀死的爪牙保留其能力，且与其邻近的两名镇民之一中毒（中毒持续到亡骨魔失去能力 / 离场）。
 *
 * 说明：
 * - 爬牙保留能力与中毒邻居的具体结算在统一的 demon/killPlayer 流程与夜晚逻辑中处理；
 * - 这里仅用于夜晚顺位 & UI 交互（目标数量 / 提示文案）。
 */
export const vigormortis: RoleDefinition = {
  id: "vigormortis",
  name: "亡骨魔",
  type: "demon",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 2 : 5,
    
    target: {
      count: {
        // 每晚必须选择 1 名玩家作为攻击目标
        min: 1,
        max: 1,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（亡骨魔）。`,
        instruction: "请选择一名玩家杀死（若其为爪牙且可被杀死，他在死亡后保留能力，且与其邻近的两名镇民之一中毒）。",
        close: `${playerSeatId + 1}号玩家（亡骨魔），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `亡骨魔（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
