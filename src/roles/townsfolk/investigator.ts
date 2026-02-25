import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 调查员 (Investigator)
 * 说明：首夜得知一名爪牙的具体身份。
 * 当前占位：已在 nightLogic 中实现。
 */
export const investigator: RoleDefinition = {
  id: "investigator",
  name: "调查员",
  type: "townsfolk",
  firstNight: {
    order: 51,
    target: {
      count: { min: 2, max: 2 },
    },
    dialog: (playerSeatId, isFirstNight) => ({
      wake: "调查员，请睁眼。请看这两名玩家",
      instruction: "其中一位是特定的爪牙，另一位不确定。",
      close: "调查员，请闭眼。",
    }),
    handler: (context) => {
      // investigator uses built-in UI
      return {
        updates: [],
        logs: {
          privateLog: `调查员(${context.selfId + 1}号) 查看了 ${context.targets.map(id => id + 1).join("号和 ")}号玩家`
        },
      };
    },
  }
};
