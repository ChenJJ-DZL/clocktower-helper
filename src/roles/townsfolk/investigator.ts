import { RoleDefinition } from "../../types/roleDefinition";
import { NightActionContext, NightActionResult } from "../../types/roleDefinition";

/**
 * 调查员 (Investigator)
 * 首夜获知两名玩家（其中一名是特定爪牙）
 */
export const investigator: RoleDefinition = {
  id: "investigator",
  name: "调查员",
  type: "townsfolk",
  
  // 只在首夜行动
  firstNight: {
    order: 10,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      if (!isFirstNight) {
        return {
          wake: "",
          instruction: "",
          close: "",
        };
      }
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（调查员）。`,
        instruction: "向其展示两名玩家（其中之一为特定爪牙）。说书人需要根据游戏设置，随机选择一名爪牙角色，然后选择两名玩家（其中一名是该爪牙，另一名是伪装/误导）。",
        close: `${playerSeatId + 1}号玩家（调查员），请闭眼。`,
      };
    },
    
    handler: (context: NightActionContext): NightActionResult => {
      // 调查员是被动获取信息，不需要处理逻辑
      // 说书人根据 dialog 提示手动告知信息
      return {
        updates: [],
        logs: {
          privateLog: `调查员（${context.selfId + 1}号）已被告知信息`,
        },
      };
    },
  },
};

