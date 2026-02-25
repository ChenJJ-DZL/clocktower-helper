import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 图书管理员 (Librarian)
 * 说明：首夜得知一名外来者的具体身份。
 * 当前占位：已在 nightLogic 中实现。
 */
export const librarian: RoleDefinition = {
  id: "librarian",
  name: "图书管理员",
  type: "townsfolk",
  firstNight: {
    order: 50,
    target: {
      count: { min: 2, max: 2 },
    },
    dialog: (playerSeatId, isFirstNight) => ({
      wake: "图书管理员，请睁眼。请看这两名玩家",
      instruction: "其中一位是特定的外来者，另一位不确定。",
      close: "图书管理员，请闭眼。",
    }),
    handler: (context) => {
      // librarian uses built-in UI
      return {
        updates: [],
        logs: {
          privateLog: `图书管理员(${context.selfId + 1}号) 查看了 ${context.targets.map(id => id + 1).join("号和 ")}号玩家`
        },
      };
    },
  }
};
