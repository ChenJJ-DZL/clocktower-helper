import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 红唇女郎 (Scarlet Woman)
 * 若恶魔死时活人>=5，她变恶魔（无夜晚行动，但可能在夜晚被唤醒）
 */
export const scarlet_woman: RoleDefinition = {
  id: "scarlet_woman",
  name: "红唇女郎",
  type: "minion",
  
  // 非首夜可能被唤醒（如果变成恶魔）
  night: {
    order: (isFirstNight) => isFirstNight ? 0 : 18,
    
    target: {
      count: {
        min: 0,
        max: 0,
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
        wake: `唤醒${playerSeatId + 1}号玩家（红唇女郎）。`,
        instruction: "如果在此时变成恶魔，请执行恶魔行动（否则闭眼）",
        close: `${playerSeatId + 1}号玩家（红唇女郎），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // 红唇女郎变成恶魔的逻辑在其他地方处理
      return {
        updates: [],
        logs: {
          privateLog: `红唇女郎（${context.selfId + 1}号）检查是否变成恶魔`,
        },
      };
    },
  },
};

