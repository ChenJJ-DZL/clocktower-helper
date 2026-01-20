import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 钟表匠 (Clockmaker)
 *
 * 在你的首个夜晚，你会得知恶魔与爪牙之间最近的距离（邻座为 1）。
 * - 只在首夜获得一次信息，之后不再唤醒；
 * - 距离按环形座位计算，取所有“恶魔-爪牙”组合中的最小值；
 * - 具体数值的计算与真 / 假信息、涡流环境等，委托给统一的 `nightLogic` 信息管线。
 */
export const clockmaker: RoleDefinition = {
  id: "clockmaker",
  name: "钟表匠",
  type: "townsfolk",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 4 : 0,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      if (!isFirstNight) {
        // 非首夜不再唤醒，由夜晚队列控制
        return { wake: "", instruction: "", close: "" };
      }
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（钟表匠）。`,
        instruction: "说书人将用手势告知：恶魔与任一爪牙之间最近的距离（邻座为1）。",
        close: `${playerSeatId + 1}号玩家（钟表匠），请闭眼。`,
      };
    },
    
    // 具体信息在 nightLogic 中计算与记录，这里无需额外 handler
    handler: (context) => ({
      updates: [],
      logs: {
        privateLog: `钟表匠（${context.selfId + 1}号）在首夜获得了距离信息`,
      },
    }),
  },
};
