import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 筑梦师 (Dreamer)
 *
 * 每个夜晚，你要选择除你及旅行者以外的一名玩家：
 * - 你会得知一个善良角色和一个邪恶角色，其中一个是该玩家的真实角色；
 * - 具体哪两个角色、谁真谁假，以及在涡流 / 醉酒 / 中毒下如何扭曲，由统一的 `nightLogic` 信息管线处理；
 * - 这里仅负责夜晚顺位、可选目标限制与 UI 提示。
 */
export const dreamer: RoleDefinition = {
  id: "dreamer",
  name: "筑梦师",
  type: "townsfolk",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 8 : 8,
    
    target: {
      count: {
        // 每晚必须选择 1 名目标（除自己与旅行者外）
        min: 1,
        max: 1,
      },
      canSelect: (target: Seat, self: Seat) => {
        if (!target.role) return false;
        if (target.id === self.id) return false;
        if (target.role.type === 'traveler') return false;
        return true;
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（筑梦师）。`,
        instruction: "请选择除你及旅行者以外的一名玩家，说书人会告知你：一个善良角色和一个邪恶角色，其中一个是该玩家的真实角色。",
        close: `${playerSeatId + 1}号玩家（筑梦师），请闭眼。`,
      };
    },
    
    // 真正的信息生成与真假角色对由 nightLogic 处理，这里只做日志记录
    handler: (context) => ({
      updates: [],
      logs: {
        privateLog: context.targets.length > 0
          ? `筑梦师（${context.selfId + 1}号）选择了${context.targets[0] + 1}号玩家`
          : `筑梦师（${context.selfId + 1}号）本夜未选择目标`,
      },
    }),
  },
};
