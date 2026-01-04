import { useCallback } from "react";
import { Seat, GamePhase } from "../../app/data";
import { RoleDefinition, NightActionContext, NightActionResult } from "../types/roleDefinition";
import { getRoleDefinition } from "../roles/index";

/**
 * 角色行动执行结果
 */
export interface RoleActionResult {
  /**
   * 更新后的座位数组
   */
  nextSeats: Seat[];
  
  /**
   * 行动产生的日志
   */
  logs: {
    publicLog?: string;
    privateLog?: string;
    secretInfo?: string;
  };
}

/**
 * 角色行动执行选项
 */
export interface ExecuteActionOptions {
  /**
   * 当前座位数组
   */
  currentSeats: Seat[];
  
  /**
   * 角色 ID
   */
  roleId: string;
  
  /**
   * 执行行动的玩家 ID
   */
  performerId: number;
  
  /**
   * 选中的目标 ID 列表
   */
  targetIds: number[];
  
  /**
   * 游戏阶段
   */
  gamePhase: GamePhase;
  
  /**
   * 当前夜晚计数（首夜为 0 或 1）
   */
  nightCount: number;
}

/**
 * 角色行动管理 Hook
 * 提供通用的角色行动执行逻辑
 */
export function useRoleAction() {
  /**
   * 执行角色行动
   * 这是一个纯函数，不直接修改 state，返回计算后的新状态
   * 
   * @param options 执行选项
   * @returns 执行结果，如果角色未注册或没有夜晚行动则返回 null
   */
  const executeAction = useCallback((
    options: ExecuteActionOptions
  ): RoleActionResult | null => {
    const {
      currentSeats,
      roleId,
      performerId,
      targetIds,
      gamePhase,
      nightCount,
    } = options;

    // 1. 查找角色定义
    const roleDef = getRoleDefinition(roleId);
    if (!roleDef) {
      console.warn(`角色定义未找到: ${roleId}`);
      return null;
    }

    // 2. 判断是首夜还是后续夜晚
    const isFirstNight = gamePhase === "firstNight" || nightCount === 0;
    
    // 3. 选择对应的行动配置（优先使用 firstNight，否则使用 night）
    const actionConfig = isFirstNight && roleDef.firstNight
      ? roleDef.firstNight
      : roleDef.night;

    if (!actionConfig) {
      // 该角色在当前夜晚没有行动
      return null;
    }

    // 4. 构建夜晚行动上下文
    const context: NightActionContext = {
      seats: currentSeats,
      targets: targetIds,
      selfId: performerId,
      gamePhase,
      nightCount,
    };

    // 5. 执行 handler
    let result: NightActionResult;
    try {
      result = actionConfig.handler(context);
    } catch (error) {
      console.error(`执行角色行动失败 (${roleId}):`, error);
      return null;
    }

    // 6. 应用状态更新
    // 将 updates 合并到对应的座位上
    const nextSeats = currentSeats.map(seat => {
      const update = result.updates.find(u => u.id === seat.id);
      if (!update) {
        return seat;
      }

      // 合并更新，注意需要处理数组类型的字段（如 statusDetails, statuses）
      const mergedSeat: Seat = { ...seat };
      
      // 处理 statusDetails（字符串数组）
      if (update.statusDetails !== undefined) {
        mergedSeat.statusDetails = update.statusDetails;
      }
      
      // 处理 statuses（StatusEffect 数组）
      if (update.statuses !== undefined) {
        mergedSeat.statuses = update.statuses;
      }
      
      // 处理其他字段（直接覆盖）
      Object.keys(update).forEach(key => {
        if (key !== 'id' && key !== 'statusDetails' && key !== 'statuses') {
          (mergedSeat as any)[key] = (update as any)[key];
        }
      });

      return mergedSeat;
    });

    // 7. 返回结果
    return {
      nextSeats,
      logs: result.logs,
    };
  }, []);

  /**
   * 检查目标是否可选
   * 
   * @param roleId 角色 ID
   * @param performerId 执行行动的玩家 ID
   * @param targetId 目标玩家 ID
   * @param currentSeats 当前座位数组
   * @param selectedTargets 已选择的目标 ID 列表
   * @param isFirstNight 是否为首夜
   * @returns 是否可选
   */
  const canSelectTarget = useCallback((
    roleId: string,
    performerId: number,
    targetId: number,
    currentSeats: Seat[],
    selectedTargets: number[],
    isFirstNight: boolean
  ): boolean => {
    // 1. 查找角色定义
    const roleDef = getRoleDefinition(roleId);
    if (!roleDef) {
      return false;
    }

    // 2. 选择对应的行动配置
    const actionConfig = isFirstNight && roleDef.firstNight
      ? roleDef.firstNight
      : roleDef.night;

    if (!actionConfig || !actionConfig.target.canSelect) {
      // 如果没有 canSelect 函数，默认允许选择
      return true;
    }

    // 3. 查找执行者和目标座位
    const performerSeat = currentSeats.find(s => s.id === performerId);
    const targetSeat = currentSeats.find(s => s.id === targetId);

    if (!performerSeat || !targetSeat) {
      return false;
    }

    // 4. 调用 canSelect 函数
    return actionConfig.target.canSelect(
      targetSeat,
      performerSeat,
      currentSeats,
      selectedTargets
    );
  }, []);

  /**
   * 获取目标选择数量要求
   * 
   * @param roleId 角色 ID
   * @param isFirstNight 是否为首夜
   * @returns 目标数量要求，如果角色未注册或没有夜晚行动则返回 null
   */
  const getTargetCount = useCallback((
    roleId: string,
    isFirstNight: boolean
  ): { min: number; max: number } | null => {
    const roleDef = getRoleDefinition(roleId);
    if (!roleDef) {
      return null;
    }

    const actionConfig = isFirstNight && roleDef.firstNight
      ? roleDef.firstNight
      : roleDef.night;

    if (!actionConfig) {
      return null;
    }

    return actionConfig.target.count;
  }, []);

  /**
   * 获取角色对话
   * 
   * @param roleId 角色 ID
   * @param performerId 执行行动的玩家 ID
   * @param isFirstNight 是否为首夜
   * @returns 对话内容，如果角色未注册或没有夜晚行动则返回 null
   */
  const getDialog = useCallback((
    roleId: string,
    performerId: number,
    isFirstNight: boolean
  ) => {
    const roleDef = getRoleDefinition(roleId);
    if (!roleDef) {
      return null;
    }

    const actionConfig = isFirstNight && roleDef.firstNight
      ? roleDef.firstNight
      : roleDef.night;

    if (!actionConfig) {
      return null;
    }

    return actionConfig.dialog(performerId, isFirstNight);
  }, []);

  /**
   * 获取角色唤醒顺序
   * 
   * @param roleId 角色 ID
   * @param isFirstNight 是否为首夜
   * @returns 唤醒顺序，如果角色未注册或没有夜晚行动则返回 null
   */
  const getWakeOrder = useCallback((
    roleId: string,
    isFirstNight: boolean
  ): number | null => {
    const roleDef = getRoleDefinition(roleId);
    if (!roleDef) {
      return null;
    }

    const actionConfig = isFirstNight && roleDef.firstNight
      ? roleDef.firstNight
      : roleDef.night;

    if (!actionConfig) {
      return null;
    }

    if (typeof actionConfig.order === 'function') {
      return actionConfig.order(isFirstNight);
    }

    return actionConfig.order;
  }, []);

  return {
    executeAction,
    canSelectTarget,
    getTargetCount,
    getDialog,
    getWakeOrder,
  };
}

