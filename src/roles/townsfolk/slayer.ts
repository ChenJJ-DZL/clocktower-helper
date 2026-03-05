import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 猎手 (Slayer)
 * 说明：每局游戏限一次，你可以在白天时公开选择一名玩家：如果他是恶魔，他死亡。
 * 当前占位：已在 nightLogic 中实现。
 */
export const slayer: RoleDefinition = {
  id: "slayer",
  name: "猎手",
  type: "townsfolk",
  detailedDescription: "整局游戏限一次，在白天时，你可以公开选择一名玩家：如果他是恶魔，则该玩家死亡。\n\n**运作方式:**\n只要猎手处于存活状态，在任何白天的任何时刻，猎手都可以发动他的能力。如果被选到的玩家就是恶魔，则这名玩家死亡。（小鬼不能将恶魔身份传递了）。\n向大家宣布这名玩家死亡。一旦如此，这便证实了这名玩家就是恶魔，这就表示善良阵营赢了。哪怕说书人不能确认猎手（例如猎手醉酒或中毒了）或是这名玩家不是恶魔，猎手都会失去他的能力状态。\n\n**提示与技巧:**\n- 确保所有人听到了你试图使用能力的声明。\n- 如果你击中并且杀死了恶魔你就赢了！耶！如果没有的话……那你就只能指望你的团队能在之后处决掉恶魔了。\n- 不要着急使用能力，如果你一开始就使用能力很有可能根本打不中。随着时间的推移恶魔会逐渐现身，如果你能活在后期，那时你的机会更大。\n- 随便选个人的效果非常差，建议不要这么做。你最好是能和你的团队商量着来，多搜集些情报。\n- 你可以在任何你愿意的时候自证身份。如果你是个非常不善于说谎而且很容易把角色写在脸上的人，你可以试着在这个角色上这么做！\n- 不要随随便便使用你的能力，除非你是为了证明给能复活你的教授看！\n- 有时候你可以故意表现的鬼鬼祟祟从而试着让恶魔在夜里把你杀了。这么做其实没啥好处，但是很有意思。\n- 为了活下来，你可以试着去拿其他镇民的身份来伪装（比如士兵或僧侣），然后等到了游戏后期的时候再冷不丁地“砰！”",
  day: {
    name: "射击",
    maxUses: 1,
    target: {
      min: 1,
      max: 1
    },
    handler: (context) => {
      const { seats, targets, killPlayer } = context;
      const targetId = targets[0];
      const targetSeat = seats.find(s => s.id === targetId);

      if (!targetSeat || targetSeat.isDead) {
        return {
          updates: [],
          logs: { privateLog: "猎手射击失败：目标不存在或已死亡" }
        };
      }

      // 猎手验证逻辑：是否命中恶魔
      const isDemon = targetSeat.role?.type === 'demon' || targetSeat.isDemonSuccessor;

      if (isDemon) {
        killPlayer(targetId);
        return {
          updates: [],
          logs: {
            publicLog: `🎯 猎手射击了 ${targetId + 1}号，命中！恶魔死亡！`,
            privateLog: `猎手击杀了 ${targetId + 1}号恶魔`
          }
        };
      } else {
        return {
          updates: [],
          logs: {
            publicLog: `💨 猎手射击了 ${targetId + 1}号，未命中。`,
            privateLog: `猎手射击了 ${targetId + 1}号，但目标不是恶魔`
          }
        };
      }
    }
  },
  night: {
    order: 0,
    target: { count: { min: 0, max: 0 } },
    dialog: (playerSeatId) => ({ wake: "", instruction: "", close: "" }),
    handler: (context) => ({ updates: [], logs: { privateLog: "猎手(被动能力)" } }),
  }
};
