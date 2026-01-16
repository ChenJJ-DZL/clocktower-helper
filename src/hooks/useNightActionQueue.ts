"use client";

import { useCallback, useMemo } from "react";
import type { Seat, GamePhase } from "../../app/data";
import { useGameContext, gameActions } from "../contexts/GameContext";
import { generateNightActionQueue, filterValidNightQueue } from "../utils/nightQueueGenerator";

/**
 * 夜间行动队列管理 Hook
 * 使用 GameContext 管理夜间行动队列，确保单一数据源
 */
export function useNightActionQueue() {
  const { state, dispatch } = useGameContext();
  
  // 当前队列信息
  const currentQueueIndex = state.currentQueueIndex;
  const nightActionQueue = state.nightActionQueue;
  const gamePhase = state.gamePhase;
  const deadThisNight = state.deadThisNight;
  const seats = state.seats;
  
  // 当前队列项
  const currentQueueItem = useMemo(() => {
    if (currentQueueIndex >= 0 && currentQueueIndex < nightActionQueue.length) {
      return nightActionQueue[currentQueueIndex];
    }
    return null;
  }, [currentQueueIndex, nightActionQueue]);
  
  // 当前队列项的ID（用于兼容旧代码）
  const currentQueueItemId = currentQueueItem?.id;
  
  // wakeQueueIds（用于兼容旧代码）
  const wakeQueueIds = useMemo(() => {
    return nightActionQueue.map(seat => seat.id);
  }, [nightActionQueue]);
  
  // 是否到达队列末尾
  const isAtEndOfQueue = useMemo(() => {
    return currentQueueIndex >= nightActionQueue.length - 1;
  }, [currentQueueIndex, nightActionQueue.length]);
  
  // 队列是否为空
  const isQueueEmpty = nightActionQueue.length === 0;
  
  /**
   * 前进到下一个夜间行动
   * 自动跳过已死亡且无能力的角色
   */
  const nextAction = useCallback(() => {
    dispatch(gameActions.nextNightAction());
  }, [dispatch]);
  
  /**
   * 后退到上一个夜间行动
   */
  const prevAction = useCallback(() => {
    dispatch(gameActions.prevNightAction());
  }, [dispatch]);
  
  /**
   * 设置队列索引
   */
  const setQueueIndex = useCallback((index: number) => {
    dispatch(gameActions.setCurrentQueueIndex(index));
  }, [dispatch]);
  
  /**
   * 设置夜间行动队列
   */
  const setQueue = useCallback((queue: Seat[]) => {
    dispatch(gameActions.setNightActionQueue(queue));
  }, [dispatch]);
  
  /**
   * 过滤队列中的已死亡角色
   */
  const filterDeadFromQueue = useCallback(() => {
    dispatch(gameActions.filterDeadFromQueue());
  }, [dispatch]);
  
  /**
   * 开始夜晚 - 生成队列并设置
   */
  const startNight = useCallback((isFirstNight: boolean) => {
    const queue = generateNightActionQueue(seats, isFirstNight);
    dispatch(gameActions.startNight(queue, isFirstNight));
  }, [seats, dispatch]);
  
  /**
   * 继续到下一个行动
   * 这是 continueToNextAction 的新版本，使用 GameContext
   */
  const continueToNextAction = useCallback(() => {
    // 如果队列为空，直接返回（应该在外部处理转换到白天）
    if (isQueueEmpty) {
      console.log('[useNightActionQueue] Queue is empty, should transition to day');
      return;
    }
    
    // 过滤已死亡的玩家（但保留亡骨魔杀死的爪牙等）
    filterDeadFromQueue();
    
    // 如果当前玩家已死亡且不保留能力，跳过到下一个
    const currentSeat = currentQueueItem;
    if (currentSeat) {
      const currentRoleId = currentSeat.role?.id === 'drunk' 
        ? currentSeat.charadeRole?.id 
        : currentSeat.role?.id;
      const currentDiedTonight = deadThisNight.includes(currentSeat.id);
      
      // 特殊处理：乌鸦守护者即使死亡也要执行
      if (currentSeat.isDead && 
          !currentSeat.hasAbilityEvenDead && 
          !(currentRoleId === 'ravenkeeper' && currentDiedTonight)) {
        // 跳过当前项（NEXT_NIGHT_ACTION会自动处理）
        nextAction();
        return;
      }
    }
    
    // 检查是否到达队列末尾
    if (isAtEndOfQueue) {
      // 到达末尾，应该转换到白天（由外部处理）
      console.log('[useNightActionQueue] Reached end of queue, should transition to day');
      return;
    }
    
    // 正常前进到下一个
    nextAction();
  }, [
    isQueueEmpty,
    isAtEndOfQueue,
    currentQueueItem,
    deadThisNight,
    filterDeadFromQueue,
    nextAction,
  ]);
  
  return {
    // 队列状态
    nightActionQueue,
    currentQueueIndex,
    currentQueueItem,
    currentQueueItemId,
    wakeQueueIds, // 兼容旧代码
    isAtEndOfQueue,
    isQueueEmpty,
    
    // 队列操作方法
    nextAction,
    prevAction,
    setQueueIndex,
    setQueue,
    filterDeadFromQueue,
    startNight,
    continueToNextAction,
  };
}

