import type {
  ExecutionContext,
  ExecutionResult,
  RoleDefinition,
} from "../../types/roleDefinition";

/**
 * 圣徒 (Saint)
 * 若死于处决，邪恶方立即获胜（无夜晚行动）
 */
export const saint: RoleDefinition = {
  id: "saint",
  name: "圣徒",
  type: "outsider",
  detailedDescription:
    "如果你死于处决，你的阵营落败。\n\n**运作方式:**\n如果圣徒因处决而死亡，宣布游戏结束且邪恶阵营获胜。仅当因处决死亡时生效，因其他原因如被恶魔杀死时游戏继续。\n\n**提示与技巧:**\n- 保证善良阵营知道你是圣徒！如果你被提名了，一定要大声喊出自己是圣徒……游戏的结局如何就看此时了。\n- 为了证明你是善良角色，你可以找其他善良玩家来查验你。比如找共情者、占卜师、守鸦人、甚至让猎手尝试击杀你。\n- 恶魔通常在晚上不会想杀你。你有另一种方法，你可以保持沉默或者伪装成一个对恶魔来说非常有吸引力的目标（像猎手或是僧侣），在晚上死了就能规避白天被意外处决的风险。\n- 找出场上存在哪些外来者。如果数量吻合，即使你一开始隐瞒身份，大家也会更容易相信你是外来者。",
  clarifications: [
    "在其他剧本中，如果一名被改变为邪恶的圣徒被处决，善良阵营获胜。",
    "特定角色互动：小怪宝：照看小怪宝的圣徒如果作为场上最后一名存活的恶魔被处决，善良阵营会获胜。",
  ],
  // 无夜晚行动（被动能力）

  /**
   * 圣徒被处决时的特殊处理
   * 如果圣徒被处决且未中毒/未醉酒，邪恶方立即获胜
   */
  onExecution: (context: ExecutionContext): ExecutionResult => {
    const { executedSeat, seats, forceExecution } = context;

    // 如果中毒或醉酒，能力失效，走默认处决流程
    if (executedSeat.isPoisoned || executedSeat.isDrunk) {
      return {
        handled: false,
      };
    }

    // --- 相克规则：圣徒 & 小怪宝 ---
    // 规则：照看小怪宝的圣徒如果作为场上最后一名存活的恶魔被处决，善良阵营获胜。
    const isCaringForLilMonsta =
      !!executedSeat.statusDetails?.includes("is_lil_monsta");

    // 查找除当前被处决圣徒外的其他存活恶魔
    const livingDemons = seats.filter(
      (s) =>
        s.id !== executedSeat.id &&
        !s.isDead &&
        (s.role?.type === "demon" ||
          !!s.statusDetails?.includes("is_lil_monsta"))
    );

    if (isCaringForLilMonsta && livingDemons.length === 0) {
      // 满足相克规则，善良阵营胜利
      return {
        handled: true,
        gameOver: {
          winResult: "good",
          winReason: "照看小怪宝的圣徒作为最后一名恶魔被处决",
        },
        logs: {
          publicLog: `${executedSeat.id + 1}号（圣徒）被处决，但由于小怪宝相克规则，善良阵营获胜！`,
          privateLog:
            "游戏结束：圣徒（小怪宝看护者）作为最后恶魔被处决，善良阵营获胜",
        },
      };
    }

    // --- 默认圣徒逻辑 ---
    // 如果不满足相克规则，则执行圣徒的常规失败逻辑
    if (forceExecution) {
      return {
        handled: true,
        gameOver: {
          winResult: "evil",
          winReason: "圣徒被处决",
        },
        logs: {
          publicLog: `${executedSeat.id + 1}号被处决`,
          privateLog: "游戏结束：圣徒被处决，邪恶阵营获胜",
        },
      };
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
  },
  night: {
    order: 0,
    target: { count: { min: 0, max: 0 } },
    dialog: (_playerSeatId) => ({ wake: "", instruction: "", close: "" }),
    handler: (_context) => ({
      updates: [],
      logs: { privateLog: "圣徒(被动能力)" },
    }),
  },
};
