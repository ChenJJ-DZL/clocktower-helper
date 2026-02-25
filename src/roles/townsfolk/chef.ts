import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 厨师 (Chef)
 * 说明：首夜得知有多少对邪恶玩家相邻。
 * 当前占位：已在 nightLogic 中实现。
 */
export const chef: RoleDefinition = {
  id: "chef",
  name: "厨师",
  type: "townsfolk",
  firstNight: {
    order: 52,
    target: {
      count: { min: 0, max: 0 },
    },
    dialog: (playerSeatId, isFirstNight) => ({
      wake: "厨师，请睁眼。这是相邻邪恶玩家的对数",
      instruction: "请出示手指告诉厨师（0对应点头，1、2等对应数字）",
      close: "厨师，请闭眼。",
    }),
    handler: (context) => {
      // chef uses built-in UI
      return {
        updates: [],
        logs: {
          privateLog: `厨师(${context.selfId + 1}号) 本局得知结果`
        },
      };
    },
  }
};
