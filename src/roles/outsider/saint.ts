import { RoleDefinition, ExecutionContext, ExecutionResult } from "../../types/roleDefinition";

/**
 * 圣徒 (Saint)
 * 若死于处决，邪恶方立即获胜（无夜晚行动）
 */
export const saint: RoleDefinition = {
  id: "saint",
  name: "圣徒",
  type: "outsider",
  // 无夜晚行动（被动能力）
  
  /**
   * 圣徒被处决时的特殊处理
   * 如果圣徒被处决且未中毒，邪恶方立即获胜
   */
  onExecution: (context: ExecutionContext): ExecutionResult => {
    const { executedSeat, forceExecution } = context;
    
    // 如果强制处决（跳过确认），直接处理
    if (forceExecution) {
      // 检查是否中毒（中毒时圣徒被处决不会导致邪恶获胜）
      if (!executedSeat.isPoisoned) {
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
};

