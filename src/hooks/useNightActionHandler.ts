/**
 * 夜晚行动处理 Hook
 * 统一处理角色夜晚行动的确认和执行
 * 
 * 职责：
 * 1. 从角色定义中获取处理函数
 * 2. 调用角色特定的处理逻辑
 * 3. 应用状态更新
 */

import { useCallback } from "react";
import { Seat, Role } from "../../app/data";
import { NightInfoResult } from "../types/game";
import { RoleDefinition, NightActionContext, NightActionResult } from "../types/roleDefinition";
import { getRoleDefinition } from "../roles";

export interface NightActionHandlerContext {
  nightInfo: NightInfoResult | null;
  seats: Seat[];
  selectedTargets: number[];
  gamePhase: string;
  nightCount: number;
  roles: Role[];
  
  // 状态更新函数
  setSeats: React.Dispatch<React.SetStateAction<Seat[]>>;
  setSelectedActionTargets: React.Dispatch<React.SetStateAction<number[]>>;
  
  // 辅助函数
  addLog: (message: string) => void;
  continueToNextAction: () => void;
}

/**
 * 使用角色定义的 handler 处理夜晚行动
 */
export function useNightActionHandler() {
  /**
   * 处理夜晚行动确认
   * 从角色定义中获取 handler 并执行
   */
  const handleNightAction = useCallback((
    context: NightActionHandlerContext
  ): boolean => {
    const { nightInfo, seats, selectedTargets, gamePhase, nightCount } = context;
    
    if (!nightInfo) {
      return false;
    }
    
    const roleId = nightInfo.effectiveRole.id;
    const roleDef = getRoleDefinition(roleId);
    
    if (!roleDef) {
      console.warn(`[useNightActionHandler] 未找到角色定义: ${roleId}`);
      return false;
    }
    
    // 确定使用首夜还是普通夜晚的配置
    const isFirstNight = gamePhase === 'firstNight';
    const nightConfig = isFirstNight 
      ? (roleDef.firstNight || roleDef.night)
      : roleDef.night;
    
    if (!nightConfig || !nightConfig.handler) {
      // 该角色没有夜晚行动处理函数
      return false;
    }
    
    // 构建夜晚行动上下文
    const actionContext: NightActionContext = {
      seats,
      targets: selectedTargets,
      selfId: nightInfo.seat.id,
      gamePhase: gamePhase as any,
      nightCount,
    };
    
    // 调用角色定义的 handler
    try {
      const result: NightActionResult = nightConfig.handler(actionContext);
      
      // 应用状态更新
      if (result.updates && result.updates.length > 0) {
        context.setSeats(prevSeats => {
          return prevSeats.map(seat => {
            const update = result.updates.find(u => u.id === seat.id);
            if (update) {
              // 合并更新，保留原有状态
              const { id, ...updates } = update;
              return { ...seat, ...updates };
            }
            return seat;
          });
        });
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
      
      // 清空选中的目标
      context.setSelectedActionTargets([]);
      
      return true;
    } catch (error) {
      console.error(`[useNightActionHandler] 处理角色 ${roleId} 的夜晚行动时出错:`, error);
      return false;
    }
  }, []);
  
  return {
    handleNightAction,
  };
}

