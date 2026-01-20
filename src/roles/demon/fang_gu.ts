import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 方古 (Fang Gu)
 * 每晚选一名玩家：他死亡。
 * 被该能力杀死的外来者改为变成邪恶的方古且你代替他死亡（整局仅首次成功转化生效）。
 *
 * 说明：
 * - 具体结算（外来者转恶魔、原方古死亡、一次性标记）在统一的 demon/killPlayer 流程中处理；
 * - 这里仅用于夜晚顺位 & UI 交互（目标数量 / 提示文案）。
 */
export const fang_gu: RoleDefinition = {
  id: "fang_gu",
  name: "方古",
  type: "demon",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 2 : 4,
    
    target: {
      count: {
        // 每晚必须选择 1 名玩家作为攻击目标
        min: 1,
        max: 1,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（方古）。`,
        instruction: isFirstNight
          ? "确认你的爪牙（若有），后续夜晚你将选择一名玩家杀死。"
          : "请选择一名玩家杀死（若该玩家为外来者且可被杀死，将改为他变成新的方古，你代替其死亡，本局仅首次成功转化生效）。",
        close: `${playerSeatId + 1}号玩家（方古），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `方古（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
};
