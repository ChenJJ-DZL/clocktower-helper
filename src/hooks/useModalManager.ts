"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ModalType } from "../types/modal";
import { useGameContext, gameActions } from "../contexts/GameContext";

/**
 * UseModalManagerResult - 弹窗管理 Hook 的返回结果
 */
export interface UseModalManagerResult {
  currentModal: ModalType;
  openModal: (modal: ModalType) => void;
  closeModal: () => void;
  setCurrentModal: React.Dispatch<React.SetStateAction<ModalType>>;
}

/**
 * useModalManager - 弹窗管理 Hook
 * 现已重构为原生使用 GameContext
 */
export function useModalManager(): UseModalManagerResult {
  const { state, dispatch } = useGameContext();
  const { currentModal } = state;

  const openModal = useCallback((modal: ModalType) => {
    dispatch(gameActions.setModal(modal));
  }, [dispatch]);

  const closeModal = useCallback(() => {
    dispatch(gameActions.setModal(null));
  }, [dispatch]);

  // ==========================================================================
  // currentModal <-> legacy showXxxModal “同步器”
  // 虽然我们正在向单一数据源迁移，但为了保持 UI 兼容性，暂时保留此同步逻辑。
  // 它会将新的 currentModal 状态同步到 GameContext 中的旧有状态字段。
  // ==========================================================================
  const lastSyncedModalTypeRef = useRef<NonNullable<ModalType>['type'] | null>(null);

  useEffect(() => {
    const prevType = lastSyncedModalTypeRef.current;
    const nextType = currentModal?.type ?? null;

    const clearLegacyFor = (type: NonNullable<ModalType>['type']) => {
      const clearUpdates: any = {};
      switch (type) {
        case 'KILL_CONFIRM': clearUpdates.showKillConfirmModal = null; break;
        case 'POISON_CONFIRM': clearUpdates.showPoisonConfirmModal = null; break;
        case 'POISON_EVIL_CONFIRM': clearUpdates.showPoisonEvilConfirmModal = null; break;
        case 'NIGHT_DEATH_REPORT': clearUpdates.showNightDeathReportModal = null; break;
        case 'HADESIA_KILL_CONFIRM': clearUpdates.showHadesiaKillConfirmModal = null; break;
        case 'ATTACK_BLOCKED': clearUpdates.showAttackBlockedModal = null; break;
        case 'MAYOR_REDIRECT': clearUpdates.showMayorRedirectModal = null; break;
        case 'BARBER_SWAP': clearUpdates.showBarberSwapModal = null; break;
        case 'PIT_HAG': clearUpdates.showPitHagModal = null; break;
        case 'RANGER': clearUpdates.showRangerModal = null; break;
        case 'DAMSEL_GUESS': clearUpdates.showDamselGuessModal = null; break;
        case 'STORYTELLER_DEATH': clearUpdates.showStorytellerDeathModal = null; break;
        case 'SWEETHEART_DRUNK': clearUpdates.showSweetheartDrunkModal = null; break;
        case 'KLUTZ_CHOICE': clearUpdates.showKlutzChoiceModal = null; break;
        case 'MOONCHILD_KILL': clearUpdates.showMoonchildKillModal = null; break;
        case 'RAVENKEEPER_FAKE': clearUpdates.showRavenkeeperFakeModal = null; break;
        case 'EXECUTION_RESULT': clearUpdates.showExecutionResultModal = null; break;
        case 'SHOOT_RESULT': clearUpdates.showShootResultModal = null; break;
        case 'VOTE_INPUT': clearUpdates.showVoteInputModal = null; break;
        case 'DAY_ACTION': clearUpdates.showDayActionModal = null; break;
        case 'DAY_ABILITY': clearUpdates.showDayAbilityModal = null; break;
        case 'SAINT_EXECUTION_CONFIRM': clearUpdates.showSaintExecutionConfirmModal = null; break;
        case 'LUNATIC_RPS': clearUpdates.showLunaticRpsModal = null; break;
        case 'VIRGIN_TRIGGER': clearUpdates.showVirginTriggerModal = null; break;
        case 'VIRGIN_GUIDE': clearUpdates.virginGuideInfo = null; break;
        case 'ROLE_SELECT': clearUpdates.showRoleSelectModal = null; break;
        case 'MADNESS_CHECK': clearUpdates.showMadnessCheckModal = null; break;
        case 'SHAMAN_CONVERT': clearUpdates.showShamanConvertModal = false; break;
        case 'SPY_DISGUISE': clearUpdates.showSpyDisguiseModal = false; break;
        case 'MAYOR_THREE_ALIVE': clearUpdates.showMayorThreeAliveModal = false; break;
        case 'REVIEW': clearUpdates.showReviewModal = false; break;
        case 'GAME_RECORDS': clearUpdates.showGameRecordsModal = false; break;
        case 'ROLE_INFO': clearUpdates.showRoleInfoModal = false; break;
        case 'RESTART_CONFIRM': clearUpdates.showRestartConfirmModal = false; break;
      }
      if (Object.keys(clearUpdates).length > 0) {
        dispatch(gameActions.updateState(clearUpdates));
      }
    };

    const syncLegacyFromCurrentModal = (modal: NonNullable<ModalType>) => {
      const updates: any = {};
      switch (modal.type) {
        case 'KILL_CONFIRM': updates.showKillConfirmModal = modal.data.targetId; break;
        case 'POISON_CONFIRM': updates.showPoisonConfirmModal = modal.data.targetId; break;
        case 'POISON_EVIL_CONFIRM': updates.showPoisonEvilConfirmModal = modal.data.targetId; break;
        case 'NIGHT_DEATH_REPORT': updates.showNightDeathReportModal = modal.data.message; break;
        case 'HADESIA_KILL_CONFIRM': updates.showHadesiaKillConfirmModal = modal.data.targetIds; break;
        case 'ATTACK_BLOCKED': updates.showAttackBlockedModal = modal.data; break;
        case 'MAYOR_REDIRECT': updates.showMayorRedirectModal = modal.data; break;
        case 'BARBER_SWAP': updates.showBarberSwapModal = modal.data; break;
        case 'PIT_HAG': updates.showPitHagModal = modal.data; break;
        case 'RANGER': updates.showRangerModal = modal.data; break;
        case 'DAMSEL_GUESS': updates.showDamselGuessModal = modal.data; break;
        case 'STORYTELLER_DEATH': updates.showStorytellerDeathModal = modal.data; break;
        case 'SWEETHEART_DRUNK': updates.showSweetheartDrunkModal = modal.data; break;
        case 'KLUTZ_CHOICE': updates.showKlutzChoiceModal = modal.data; break;
        case 'MOONCHILD_KILL': updates.showMoonchildKillModal = modal.data; break;
        case 'RAVENKEEPER_FAKE': updates.showRavenkeeperFakeModal = modal.data.targetId; break;
        case 'EXECUTION_RESULT': updates.showExecutionResultModal = { message: modal.data.message, isVirginTrigger: modal.data.isVirginTrigger }; break;
        case 'SHOOT_RESULT': updates.showShootResultModal = { message: modal.data.message, isDemonDead: modal.data.isDemonDead }; break;
        case 'VOTE_INPUT': updates.showVoteInputModal = modal.data.voterId; break;
        case 'DAY_ACTION': updates.showDayActionModal = modal.data; break;
        case 'DAY_ABILITY': updates.showDayAbilityModal = modal.data; break;
        case 'SAINT_EXECUTION_CONFIRM': updates.showSaintExecutionConfirmModal = { targetId: modal.data.targetId }; break;
        case 'LUNATIC_RPS': updates.showLunaticRpsModal = modal.data; break;
        case 'VIRGIN_TRIGGER': updates.showVirginTriggerModal = modal.data; break;
        case 'VIRGIN_GUIDE': updates.virginGuideInfo = modal.data; break;
        case 'ROLE_SELECT': updates.showRoleSelectModal = modal.data; break;
        case 'MADNESS_CHECK': updates.showMadnessCheckModal = modal.data; break;
        case 'SHAMAN_CONVERT': updates.showShamanConvertModal = true; break;
        case 'SPY_DISGUISE': updates.showSpyDisguiseModal = true; break;
        case 'MAYOR_THREE_ALIVE': updates.showMayorThreeAliveModal = true; break;
        case 'REVIEW': updates.showReviewModal = true; break;
        case 'GAME_RECORDS': updates.showGameRecordsModal = true; break;
        case 'ROLE_INFO': updates.showRoleInfoModal = true; break;
        case 'RESTART_CONFIRM': updates.showRestartConfirmModal = true; break;
      }
      if (Object.keys(updates).length > 0) {
        dispatch(gameActions.updateState(updates));
      }
    };

    if (prevType && prevType !== nextType) {
      clearLegacyFor(prevType);
    }

    if (currentModal) {
      syncLegacyFromCurrentModal(currentModal);
      lastSyncedModalTypeRef.current = currentModal.type;
    } else {
      lastSyncedModalTypeRef.current = null;
    }
  }, [currentModal, dispatch]);

  return useMemo(() => ({
    currentModal,
    openModal,
    closeModal,
    setCurrentModal: (val: React.SetStateAction<ModalType>) => {
      const next = typeof val === 'function' ? (val as (p: ModalType) => ModalType)(state.currentModal) : val;
      dispatch(gameActions.setModal(next));
    },
  }), [currentModal, openModal, closeModal, state.currentModal, dispatch]);
}
