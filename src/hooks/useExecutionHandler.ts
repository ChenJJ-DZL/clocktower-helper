/**
 * 处决处理 Hook
 * 统一处理角色被处决时的特殊逻辑
 *
 * 职责：
 * 1. 从角色定义中获取 onExecution 处理函数
 * 2. 调用角色特定的处决逻辑
 * 3. 应用状态更新和游戏结束判定
 */

import { useCallback } from "react";
import type { GamePhase, Seat } from "../../app/data";
import { getRoleDefinition } from "../roles";
import type {
  ExecutionContext,
  ExecutionResult,
} from "../types/roleDefinition";

export interface ExecutionHandlerContext {
  executedSeat: Seat;
  seats: Seat[];
  gamePhase: GamePhase;
  nightCount: number;
  nominationMap: Record<number, number>;
  forceExecution?: boolean;
  skipLunaticRps?: boolean;

  // 状态更新函数
  setSeats: React.Dispatch<React.SetStateAction<Seat[]>>;
  setWinResult: React.Dispatch<React.SetStateAction<"good" | "evil" | null>>;
  setWinReason: React.Dispatch<React.SetStateAction<string | null>>;
  setGamePhase: React.Dispatch<React.SetStateAction<GamePhase>>;

  // 辅助函数
  addLog: (message: string) => void;
  checkGameOver: (updatedSeats: Seat[], deadPlayerId?: number | null) => void;

  // 弹窗控制（如果需要）
  setCurrentModal?: React.Dispatch<React.SetStateAction<any>>;
}

/**
 * 使用角色定义的 onExecution 处理处决
 */
export function useExecutionHandler() {
  /**
   * 处理角色被处决
   * 从角色定义中获取 onExecution 并执行
   */
  const handleExecution = useCallback(
    (context: ExecutionHandlerContext): ExecutionResult | null => {
      const updatedSeats = JSON.parse(JSON.stringify(context.seats));
      const {
        executedSeat,
        gamePhase,
        nightCount,
        nominationMap,
        forceExecution,
        skipLunaticRps,
      } = context;

      if (!executedSeat.role) {
        return null;
      }

      const roleId = executedSeat.role.id;
      const roleDef = getRoleDefinition(roleId);

      if (!roleDef) {
        console.warn(`[useExecutionHandler] 未找到角色定义: ${roleId}`);
        return null;
      }

      // 如果角色没有定义 onExecution，返回 null 表示使用默认逻辑
      if (!roleDef.onExecution) {
        return null;
      }

      // 首先将被处决玩家标记为死亡
      const executedSeatIndex = updatedSeats.findIndex(
        (s: Seat) => s.id === executedSeat.id
      );
      if (executedSeatIndex !== -1) {
        updatedSeats[executedSeatIndex] = {
          ...updatedSeats[executedSeatIndex],
          isDead: true,
        };
      }

      // 官方规则：处决结算优先级 - 先判断游戏结束再结算其他能力
      // 第一步：先检查游戏是否已经因为本次处决结束
      context.checkGameOver(updatedSeats, executedSeat.id);

      // 如果游戏已经结束，不需要再执行任何其他处决逻辑
      if (context.gamePhase === "gameOver") {
        return null;
      }

      // 游戏未结束，才继续执行角色的处决逻辑
      // 构建处决上下文
      const execContext: ExecutionContext = {
        executedSeat: updatedSeats[executedSeatIndex],
        seats: updatedSeats,
        gamePhase,
        nightCount,
        nominationMap,
        forceExecution,
        skipLunaticRps,
      };

      // 调用角色定义的 onExecution
      try {
        const result: ExecutionResult = roleDef.onExecution(execContext);

        // 应用座位状态更新
        if (result.seatUpdates && result.seatUpdates.length > 0) {
          context.setSeats((prevSeats) => {
            return prevSeats.map((seat) => {
              const update = result.seatUpdates?.find((u) => u.id === seat.id);
              if (update) {
                const { id, ...updates } = update;
                return { ...seat, ...updates };
              }
              return seat;
            });
          });
        }

        // 再次检查游戏结束（因为角色处决逻辑可能导致游戏结束）
        if (result.gameOver) {
          context.setWinResult(result.gameOver.winResult);
          context.setWinReason(result.gameOver.winReason);
          context.setGamePhase("gameOver");
        } else {
          // 只有在游戏仍未结束时才处理日志和弹窗
          // 记录日志
          if (result.logs) {
            if (result.logs.privateLog) {
              context.addLog(result.logs.privateLog);
            }
            if (result.logs.publicLog) {
              context.addLog(result.logs.publicLog);
            }
          }

          // 处理弹窗
          if (result.modal && context.setCurrentModal) {
            context.setCurrentModal(result.modal);
          }
        }

        return result;
      } catch (error) {
        console.error(
          `[useExecutionHandler] 处理角色 ${roleId} 的处决时出错:`,
          error
        );
        return null;
      }
    },
    []
  );

  return {
    handleExecution,
  };
}
