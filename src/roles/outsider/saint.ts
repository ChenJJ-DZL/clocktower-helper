import { RoleDefinition, ExecutionContext, ExecutionResult } from "../../types/roleDefinition";

/**
 * 圣徒 (Saint)
 * 若死于处决，邪恶方立即获胜（无夜晚行动）
 */
export const saint: RoleDefinition = {
  id: "saint",
  name: "圣徒",
  type: "outsider",
  detailedDescription: "如果你死于处决，你的阵营落败。\n\n**运作方式:**\n如果圣徒因处决而死亡，宣布游戏结束且邪恶阵营获胜。仅当因处决死亡时生效，因其他原因如被恶魔杀死时游戏继续。\n\n**提示与技巧:**\n- 保证善良阵营知道你是圣徒！如果你被提名了，一定要大声喊出自己是圣徒……游戏的结局如何就看此时了。\n- 为了证明你是善良角色，你可以找其他善良玩家来查验你。比如找共情者、占卜师、守鸦人、甚至让猎手尝试击杀你。\n- 恶魔通常在晚上不会想杀你。你有另一种方法，你可以保持沉默或者伪装成一个对恶魔来说非常有吸引力的目标（像猎手或是僧侣），在晚上死了就能规避白天被意外处决的风险。\n- 找出场上存在哪些外来者。如果数量吻合，即使你一开始隐瞒身份，大家也会更容易相信你是外来者。",
  clarifications: [
    "在其他剧本中，如果一名被改变为邪恶的圣徒被处决，善良阵营获胜。",
    "特定角色互动：小怪宝：照看小怪宝的圣徒如果作为场上最后一名存活的恶魔被处决，善良阵营会获胜。"
  ],
  // 无夜晚行动（被动能力）

  /**
   * 圣徒被处决时的特殊处理
   * 如果圣徒被处决且未中毒/未醉酒，邪恶方立即获胜
   */
  onExecution: (context: ExecutionContext): ExecutionResult => {
    const { executedSeat, forceExecution } = context;

    // 如果强制处决（跳过确认），直接处理
    if (forceExecution) {
      // 规则对齐：中毒或醉酒时圣徒能力失效
      const disabled = executedSeat.isPoisoned || executedSeat.isDrunk;
      if (!disabled) {
        return {
          handled: true,
          gameOver: {
            winResult: 'evil',
            winReason: '圣徒被处决',
          },
          logs: {
            publicLog: `${executedSeat.id + 1}号被处决`,
            privateLog: '游戏结束：圣徒被处决，邪恶阵营获胜',
          },
        };
      }
    } else {
      // 需要确认弹窗（由控制器处理）
      return {
        handled: true,
        shouldWait: true,
        logs: {
          privateLog: `圣徒（${executedSeat.id + 1}号）被处决，需要确认`,
        },
      };
    }

    // 默认处理（如果中毒）
    return {
      handled: false,
    };
  },
  night: {
    order: 0,
    target: { count: { min: 0, max: 0 } },
    dialog: (playerSeatId) => ({ wake: "", instruction: "", close: "" }),
    handler: (context) => ({ updates: [], logs: { privateLog: "圣徒(被动能力)" } }),
  },
};

