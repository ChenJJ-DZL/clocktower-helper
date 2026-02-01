"use client";

import { useMemo, useCallback } from "react";
import type { Role, Seat } from "../../app/data";
import { useGameContext, gameActions } from "../contexts/GameContext";
import {
  isActorDisabledByPoisonOrDrunk,
  isActionAbility,
  getRegistration,
  isGoodAlignment,
  getRandom
} from "../utils/gameRules";

/**
 * UseInteractionHandlerResult - 交互管理 Hook 的返回结果
 */
export interface UseInteractionHandlerResult {
  handleSeatClick: (seatId: number, options?: { force?: boolean }) => void;
  toggleTarget: (seatId: number) => void;
  confirmAction: () => void;
  cancelAction: () => void;
  isTargetDisabled: (seat: Seat) => boolean;
  handleConfirmAction: () => void;
  handleMenuAction: (action: string) => void;
  toggleStatus: (type: string, seatId?: number) => void;
}

/**
 * useInteractionHandler - 交互与行动管理 Hook
 * 现已重构为原生使用 GameContext
 */
export function useInteractionHandler(deps: {
  getRoleTargetCount: (roleId: string, isFirstNight: boolean) => { min: number; max: number } | null;
  handleConfirmActionImpl?: () => void;
  [key: string]: any;
}): UseInteractionHandlerResult {
  const { state, dispatch } = useGameContext();
  const {
    gamePhase, seats, selectedRole, wakeQueueIds, currentWakeIndex,
    selectedActionTargets, nightCount, contextMenu, currentModal,
    isVortoxWorld, nightActionQueue
  } = state;

  const handleSeatClick = useCallback((id: number, _options?: { force?: boolean }) => {
    if (gamePhase === 'setup' || gamePhase === 'scriptSelection') {
      if (selectedRole) {
        // 检查该角色是否已经入座
        const existingSeat = seats.find(s => s.role?.id === selectedRole.id);

        if (existingSeat) {
          // 如果点击的是同一个座位，则视为取消入座
          if (existingSeat.id === id) {
            dispatch(gameActions.updateSeat(id, { role: null }));
            return;
          }

          // 如果点击的是其他座位，且该角色已入座，提示（或者也可以设计为移动角色，看用户需求，目前保持提示但允许移动可能更好？用户说“取消落座”所以上面逻辑够了）
          // 用户特别说：再次点击某个角色时，应该是取消落座
          // 这里有歧义：点击 ROLE LIST 还是 点击 SEAT？
          // 上下文是 handleSeatClick，所以是点击 SEAT。
          // 现在的逻辑是：如果我选中了“厨师”，且“厨师”已经在 1号位。
          // case A: 我点击 1号位 -> 应该取消 1号位的厨师
          // case B: 我点击 2号位 -> 报错“该角色已入座” (保持不变，或者自动把厨师从1号挪到2号？用户没说，暂且只处理Case A)

          alert("该角色已入座");
          return;
        }
        dispatch(gameActions.updateSeat(id, { role: selectedRole }));
      } else {
        dispatch(gameActions.updateSeat(id, { role: null }));
      }
    }
  }, [gamePhase, selectedRole, seats, dispatch]);

  const toggleTarget = useCallback((targetId: number) => {
    const nightInfo = nightActionQueue[currentWakeIndex];
    if (!nightInfo) return;

    const isFirstNight = gamePhase === 'firstNight';
    // 这里暂时依赖外部传入的 getRoleTargetCount，后续可移入 roles/index.ts
    const targetCount = deps.getRoleTargetCount(nightInfo.role?.id || '', isFirstNight);
    const maxTargets = targetCount?.max ?? 1;

    let newTargets = [...selectedActionTargets];
    if (newTargets.includes(targetId)) {
      newTargets = newTargets.filter(t => t !== targetId);
    } else {
      if (maxTargets === 1) {
        newTargets = [targetId];
      } else {
        if (newTargets.length >= maxTargets) {
          newTargets.shift();
        }
        newTargets.push(targetId);
      }
    }

    dispatch(gameActions.setSelectedTargets(newTargets));

    // 特殊逻辑：占卜师即时反馈
    if (nightInfo.role?.id === 'fortune_teller' && newTargets.length === 2) {
      const [aId, bId] = newTargets;
      const a = seats.find(s => s.id === aId);
      const b = seats.find(s => s.id === bId);
      if (a && b) {
        // 简化版判定逻辑，核心逻辑应在 verify 阶段
        const hasDemon = a.role?.type === 'demon' || b.role?.type === 'demon' || a.isDemonSuccessor || b.isDemonSuccessor;
        const hasRedHerring = a.isRedHerring || b.isRedHerring;
        const isYes = hasDemon || (!isVortoxWorld && hasRedHerring);
        const text = isYes ? '是' : '否';
        dispatch(gameActions.setInspectionResult(text));
      }
    }
  }, [nightActionQueue, currentWakeIndex, gamePhase, selectedActionTargets, seats, isVortoxWorld, dispatch, deps]);

  const isTargetDisabled = useCallback((_seat: Seat) => false, []);

  const handleConfirmAction = useCallback(() => {
    const nightInfo = nightActionQueue[currentWakeIndex];
    console.log("[Interaction] Confirm clicked.", {
      hasNightInfo: !!nightInfo,
      currentModalType: currentModal?.type,
      currentWakeIndex
    });

    if (!nightInfo) return;

    // 如果当前有弹窗，不处理确认
    if (currentModal) {
      console.warn("[Interaction] Confirm blocked by modal:", currentModal.type);
      return;
    }

    // 调用外部传入的确认逻辑（暂时保持，因为这涉及到复杂的角色能力处理器）
    if (deps.handleConfirmActionImpl) {
      console.log("[Interaction] Delegating to handleConfirmActionImpl");
      deps.handleConfirmActionImpl();
    } else {
      console.log("[Interaction] Dispatching nextNightAction directly");
      dispatch(gameActions.nextNightAction());
    }
  }, [nightActionQueue, currentWakeIndex, currentModal, dispatch, deps]);

  const handleMenuAction = useCallback((action: string) => {
    const seatId = contextMenu?.seatId;
    if (seatId === undefined || seatId === null) return;

    dispatch(gameActions.updateState({ contextMenu: null }));

    if (action === 'nominate') {
      dispatch(gameActions.setModal({ type: 'DAY_ACTION', data: { type: 'nominate', sourceId: seatId } }));
    } else if (action === 'slayer') {
      dispatch(gameActions.setModal({ type: 'DAY_ACTION', data: { type: 'slayer', sourceId: seatId } }));
    }
  }, [contextMenu, dispatch]);

  const toggleStatus = useCallback((type: string, seatId?: number) => {
    const targetId = seatId ?? contextMenu?.seatId;
    if (targetId === undefined || targetId === null) return;

    const seat = seats.find(s => s.id === targetId);
    if (!seat) return;

    const updates: Partial<Seat> = {};
    if (type === 'dead') updates.isDead = !seat.isDead;
    if (type === 'poison') updates.isPoisoned = !seat.isPoisoned;
    if (type === 'drunk') updates.isDrunk = !seat.isDrunk;

    dispatch(gameActions.updateSeat(targetId, updates));
    dispatch(gameActions.updateState({ contextMenu: null }));
  }, [contextMenu, seats, dispatch]);

  return useMemo(() => ({
    handleSeatClick,
    toggleTarget,
    confirmAction: handleConfirmAction,
    cancelAction: () => { },
    isTargetDisabled,
    handleConfirmAction,
    handleMenuAction,
    toggleStatus,
  }), [handleSeatClick, toggleTarget, handleConfirmAction, isTargetDisabled, handleMenuAction, toggleStatus]);
}
