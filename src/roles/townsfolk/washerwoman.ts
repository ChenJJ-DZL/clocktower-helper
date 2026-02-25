import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 洗衣妇 (Washerwoman)
 * 说明：首夜得知一名村民的具体身份。
 * 当前占位：已在 nightLogic 中实现。
 */
export const washerwoman: RoleDefinition = {
  id: "washerwoman",
  name: "洗衣妇",
  type: "townsfolk",
  firstNight: {
    order: 49,
    target: {
      count: { min: 2, max: 2 },
    },
    dialog: (playerSeatId, isFirstNight) => ({
      wake: "洗衣妇，请睁眼。请看这两名玩家",
      instruction: "其中一位是特定的镇民，另一位不是。",
      close: "洗衣妇，请闭眼。",
    }),
    handler: (context) => {
      // In the current logic, Washerwoman uses a built-in UI for reading information,
      // so this can return an empty handled result to just continue or wait.
      // Returning just empty updates lets the controller proceed. 
      return {
        updates: [],
        logs: {
          privateLog: `洗衣妇(${context.selfId + 1}号) 查看了 ${context.targets.map(id => id + 1).join("号和 ")}号玩家`
        },
      };
    },
  }
};
