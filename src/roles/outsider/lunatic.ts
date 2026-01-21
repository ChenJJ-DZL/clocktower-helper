import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 疯子 (Lunatic)
 * 你以为你是一个恶魔，但其实你不是。
 * 恶魔知道你是疯子以及你在每个夜晚选择了哪些玩家。
 * 
 * 规则要点：
 * - 疯子不知道自己的真实角色和真实阵营
 * - 疯子每个夜晚都会被唤醒来发动攻击，就如同他是场上真正的恶魔
 * - 但是疯子的选择没有效果，因为他没有恶魔的能力
 * - 疯子会在首个夜晚被唤醒来得知三个不在场的角色，以及与当前游戏数量符合的爪牙
 * - 真正的恶魔会知道疯子每个夜晚攻击了哪些玩家
 * - 疯子的能力是认知覆盖类能力
 */
export const lunatic: RoleDefinition = {
  id: "lunatic",
  name: "疯子",
  type: "outsider",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 1 : 6,
    
    target: {
      count: {
        min: 0,
        max: 1, // 根据实际恶魔类型决定，这里先设为0-1
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      if (isFirstNight) {
        return {
          wake: `唤醒${playerSeatId + 1}号玩家（疯子）。`,
          instruction: "请执行恶魔行动（假）- 你会得知三个不在场的角色和爪牙信息",
          close: `${playerSeatId + 1}号玩家（疯子），请闭眼。`,
        };
      } else {
        return {
          wake: `唤醒${playerSeatId + 1}号玩家（疯子）。`,
          instruction: "请执行恶魔行动（假）- 选择攻击目标",
          close: `${playerSeatId + 1}号玩家（疯子），请闭眼。`,
        };
      }
    },
    
    handler: (context) => {
      // 疯子的攻击没有实际效果，但真正的恶魔会知道疯子的选择
      // 首夜会显示三个不在场的角色和爪牙信息（由说书人决定）
      // 后续夜晚会记录疯子的攻击目标（供真恶魔参考）
      return {
        updates: [],
        logs: {
          privateLog: `疯子（${context.selfId + 1}号）执行了行动（无效）`,
        },
      };
    },
  },
};
