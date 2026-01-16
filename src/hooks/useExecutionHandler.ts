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
import { Seat, GamePhase } from "../../app/data";
import { RoleDefinition, ExecutionContext, ExecutionResult } from "../types/roleDefinition";
import { getRoleDefinition } from "../roles";

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
  setWinResult: React.Dispatch<React.SetStateAction<'good' | 'evil' | null>>;
  setWinReason: React.Dispatch<React.SetStateAction<string | null>>;
  setGamePhase: React.Dispatch<React.SetStateAction<GamePhase>>;
  
  // 辅助函数
  addLog: (message: string) => void;
  checkGameOver: (updatedSeats: Seat[], deadPlayerId?: number) => boolean;
  
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
  const handleExecution = useCallback((
    context: ExecutionHandlerContext
  ): ExecutionResult | null => {
    const { executedSeat, seats, gamePhase, nightCount, nominationMap, forceExecution, skipLunaticRps } = context;
    
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
    
    // 构建处决上下文
    const execContext: ExecutionContext = {
      executedSeat,
      seats,
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
        context.setSeats(prevSeats => {
          return prevSeats.map(seat => {
            const update = result.seatUpdates!.find(u => u.id === seat.id);
            if (update) {
              const { id, ...updates } = update;
              return { ...seat, ...updates };
            }
            return seat;
          });
        });
      }
      
      // 处理游戏结束
      if (result.gameOver) {
        context.setWinResult(result.gameOver.winResult);
        context.setWinReason(result.gameOver.winReason);
        context.setGamePhase('gameOver');
      }
      
      // 记录日志
      if (result.logs) {
        if (result.logs.privateLog) {
          context.addLog(result.logs.privateLog);
        }
        if (result.logs.publicLog) {
          context.addLog(result.logs.publicLog);
        }
      }
      
      return result;
    } catch (error) {
      console.error(`[useExecutionHandler] 处理角色 ${roleId} 的处决时出错:`, error);
      return null;
    }
  }, []);
  
  return {
    handleExecution,
  };
}

