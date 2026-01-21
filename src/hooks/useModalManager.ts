"use client";

import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import type { ModalType } from "../types/modal";

export interface ModalState {
  currentModal: ModalType;
  setCurrentModal: Dispatch<SetStateAction<ModalType>>;
}

export interface ModalLegacySyncDeps {
  setShowKillConfirmModal: Dispatch<SetStateAction<number | null>>;
  setShowPoisonConfirmModal: Dispatch<SetStateAction<number | null>>;
  setShowPoisonEvilConfirmModal: Dispatch<SetStateAction<number | null>>;
  setShowNightDeathReportModal: Dispatch<SetStateAction<string | null>>;
  setShowHadesiaKillConfirmModal: Dispatch<SetStateAction<number[] | null>>;
  setShowAttackBlockedModal: Dispatch<SetStateAction<any>>;
  setShowMayorRedirectModal: Dispatch<SetStateAction<any>>;
  setShowBarberSwapModal: Dispatch<SetStateAction<any>>;
  setShowPitHagModal: Dispatch<SetStateAction<any>>;
  setShowRangerModal: Dispatch<SetStateAction<any>>;
  setShowDamselGuessModal: Dispatch<SetStateAction<any>>;
  setShowStorytellerDeathModal: Dispatch<SetStateAction<any>>;
  setShowSweetheartDrunkModal: Dispatch<SetStateAction<any>>;
  setShowKlutzChoiceModal: Dispatch<SetStateAction<any>>;
  setShowMoonchildKillModal: Dispatch<SetStateAction<any>>;
  setShowRavenkeeperFakeModal: Dispatch<SetStateAction<any>>;
  setShowExecutionResultModal: Dispatch<SetStateAction<any>>;
  setShowShootResultModal: Dispatch<SetStateAction<any>>;
  setShowVoteInputModal: Dispatch<SetStateAction<any>>;
  setShowDayActionModal: Dispatch<SetStateAction<any>>;
  setShowDayAbilityModal: Dispatch<SetStateAction<any>>;
  setShowSaintExecutionConfirmModal: Dispatch<SetStateAction<any>>;
  setShowLunaticRpsModal: Dispatch<SetStateAction<any>>;
  setShowVirginTriggerModal: Dispatch<SetStateAction<any>>;
  setVirginGuideInfo: Dispatch<SetStateAction<any>>;
  setShowDrunkModal: Dispatch<SetStateAction<any>>;
  setShowRoleSelectModal: Dispatch<SetStateAction<any>>;
  setShowMadnessCheckModal: Dispatch<SetStateAction<any>>;
  setShowShamanConvertModal: Dispatch<SetStateAction<boolean>>;
  setShowSpyDisguiseModal: Dispatch<SetStateAction<boolean>>;
  setShowMayorThreeAliveModal: Dispatch<SetStateAction<boolean>>;
  setShowReviewModal: Dispatch<SetStateAction<boolean>>;
  setShowGameRecordsModal: Dispatch<SetStateAction<boolean>>;
  setShowRoleInfoModal: Dispatch<SetStateAction<boolean>>;
  setShowRestartConfirmModal: Dispatch<SetStateAction<boolean>>;
}

export interface UseModalManagerResult {
  currentModal: ModalType;
  setCurrentModal: Dispatch<SetStateAction<ModalType>>;
  openModal: (modal: ModalType) => void;
  closeModal: () => void;
}

/**
 * useModalManager - 弹窗管理
 * - currentModal 单一数据源
 * - 兼容期：currentModal <-> legacy showXxxModal 同步
 */
export function useModalManager(base: ModalState, deps?: { legacySync?: ModalLegacySyncDeps }): UseModalManagerResult {
  const openModal = useCallback((modal: ModalType) => {
    base.setCurrentModal(modal);
  }, [base]);

  const closeModal = useCallback(() => {
    base.setCurrentModal(null);
  }, [base]);

  // ==========================================================================
  // CRITICAL: currentModal <-> legacy showXxxModal “同步器”
  //
  // 背景：
  // - 新的弹窗系统使用 `currentModal` 作为单一数据源
  // - 但 UI（`GameModals`）里仍有大量 legacy `showXxxModal` props（兼容期）
  // - 如果某个流程只 setCurrentModal 而 UI 仍读 legacy，就会出现“弹窗不显示/按钮被禁用/流程卡死”
  //
  // 目标：
  // - 让 currentModal 成为事实上的 source of truth
  // - 当 currentModal 改变时，自动把对应 legacy 状态同步出来
  // - 当 currentModal 关闭或切换到别的类型时，只清理“上一次由 currentModal 同步出来的那一种”legacy 状态
  //   （避免误伤仍由旧逻辑直接驱动的 legacy 弹窗）
  // ==========================================================================
  const lastSyncedModalTypeRef = useRef<NonNullable<ModalType>['type'] | null>(null);
  useEffect(() => {
    const legacy = deps?.legacySync;
    if (!legacy) return;

    const prevType = lastSyncedModalTypeRef.current;
    const nextType = base.currentModal?.type ?? null;

    const clearLegacyFor = (type: NonNullable<ModalType>['type']) => {
      switch (type) {
        case 'KILL_CONFIRM':
          legacy.setShowKillConfirmModal(null);
          break;
        case 'POISON_CONFIRM':
          legacy.setShowPoisonConfirmModal(null);
          break;
        case 'POISON_EVIL_CONFIRM':
          legacy.setShowPoisonEvilConfirmModal(null);
          break;
        case 'NIGHT_DEATH_REPORT':
          legacy.setShowNightDeathReportModal(null);
          break;
        case 'HADESIA_KILL_CONFIRM':
          legacy.setShowHadesiaKillConfirmModal(null);
          break;
        case 'ATTACK_BLOCKED':
          legacy.setShowAttackBlockedModal(null);
          break;
        case 'MAYOR_REDIRECT':
          legacy.setShowMayorRedirectModal(null);
          break;
        case 'BARBER_SWAP':
          legacy.setShowBarberSwapModal(null);
          break;
        case 'PIT_HAG':
          legacy.setShowPitHagModal(null);
          break;
        case 'RANGER':
          legacy.setShowRangerModal(null);
          break;
        case 'DAMSEL_GUESS':
          legacy.setShowDamselGuessModal(null);
          break;
        case 'STORYTELLER_DEATH':
          legacy.setShowStorytellerDeathModal(null);
          break;
        case 'SWEETHEART_DRUNK':
          legacy.setShowSweetheartDrunkModal(null);
          break;
        case 'KLUTZ_CHOICE':
          legacy.setShowKlutzChoiceModal(null);
          break;
        case 'MOONCHILD_KILL':
          legacy.setShowMoonchildKillModal(null);
          break;
        case 'RAVENKEEPER_FAKE':
          legacy.setShowRavenkeeperFakeModal(null);
          break;
        case 'EXECUTION_RESULT':
          legacy.setShowExecutionResultModal(null);
          break;
        case 'SHOOT_RESULT':
          legacy.setShowShootResultModal(null);
          break;
        case 'VOTE_INPUT':
          legacy.setShowVoteInputModal(null);
          break;
        case 'DAY_ACTION':
          legacy.setShowDayActionModal(null);
          break;
        case 'DAY_ABILITY':
          legacy.setShowDayAbilityModal(null);
          break;
        case 'SAINT_EXECUTION_CONFIRM':
          legacy.setShowSaintExecutionConfirmModal(null);
          break;
        case 'LUNATIC_RPS':
          legacy.setShowLunaticRpsModal(null);
          break;
        case 'VIRGIN_TRIGGER':
          legacy.setShowVirginTriggerModal(null);
          break;
        case 'VIRGIN_GUIDE':
          legacy.setVirginGuideInfo(null);
          break;
        case 'DRUNK_CHARADE_SELECT':
          // Drunk charade selection is handled by the modal itself
          break;
        case 'ROLE_SELECT':
          legacy.setShowRoleSelectModal(null);
          break;
        case 'MADNESS_CHECK':
          legacy.setShowMadnessCheckModal(null);
          break;
        case 'SHAMAN_CONVERT':
          legacy.setShowShamanConvertModal(false);
          break;
        case 'SPY_DISGUISE':
          legacy.setShowSpyDisguiseModal(false);
          break;
        case 'MAYOR_THREE_ALIVE':
          legacy.setShowMayorThreeAliveModal(false);
          break;
        case 'REVIEW':
          legacy.setShowReviewModal(false);
          break;
        case 'GAME_RECORDS':
          legacy.setShowGameRecordsModal(false);
          break;
        case 'ROLE_INFO':
          legacy.setShowRoleInfoModal(false);
          break;
        case 'RESTART_CONFIRM':
          legacy.setShowRestartConfirmModal(false);
          break;
        // 这些 modal 在 UI 里已经直接从 currentModal 读（或压根不是 legacy 形态），无需同步清理
        case 'NIGHT_ORDER_PREVIEW':
        case 'RANGER': // handled above
        case 'DAWN_REPORT':
        case 'GAME_OVER':
          break;
        default:
          break;
      }
    };

    const syncLegacyFromCurrentModal = (modal: NonNullable<ModalType>) => {
      switch (modal.type) {
        case 'KILL_CONFIRM':
          legacy.setShowKillConfirmModal(modal.data.targetId);
          break;
        case 'POISON_CONFIRM':
          legacy.setShowPoisonConfirmModal(modal.data.targetId);
          break;
        case 'POISON_EVIL_CONFIRM':
          legacy.setShowPoisonEvilConfirmModal(modal.data.targetId);
          break;
        case 'NIGHT_DEATH_REPORT':
          legacy.setShowNightDeathReportModal(modal.data.message);
          break;
        case 'HADESIA_KILL_CONFIRM':
          legacy.setShowHadesiaKillConfirmModal(modal.data.targetIds);
          break;
        case 'ATTACK_BLOCKED':
          legacy.setShowAttackBlockedModal(modal.data);
          break;
        case 'MAYOR_REDIRECT':
          legacy.setShowMayorRedirectModal(modal.data);
          break;
        case 'BARBER_SWAP':
          legacy.setShowBarberSwapModal(modal.data);
          break;
        case 'PIT_HAG':
          legacy.setShowPitHagModal(modal.data);
          break;
        case 'RANGER':
          legacy.setShowRangerModal(modal.data);
          break;
        case 'DAMSEL_GUESS':
          legacy.setShowDamselGuessModal(modal.data);
          break;
        case 'STORYTELLER_DEATH':
          legacy.setShowStorytellerDeathModal(modal.data);
          break;
        case 'SWEETHEART_DRUNK':
          legacy.setShowSweetheartDrunkModal(modal.data);
          break;
        case 'KLUTZ_CHOICE':
          legacy.setShowKlutzChoiceModal(modal.data);
          break;
        case 'MOONCHILD_KILL':
          legacy.setShowMoonchildKillModal(modal.data);
          break;
        case 'RAVENKEEPER_FAKE':
          legacy.setShowRavenkeeperFakeModal(modal.data.targetId);
          break;
        case 'EXECUTION_RESULT':
          legacy.setShowExecutionResultModal({ message: modal.data.message, isVirginTrigger: modal.data.isVirginTrigger });
          break;
        case 'SHOOT_RESULT':
          legacy.setShowShootResultModal({ message: modal.data.message, isDemonDead: modal.data.isDemonDead });
          break;
        case 'VOTE_INPUT':
          legacy.setShowVoteInputModal(modal.data.voterId);
          break;
        case 'DAY_ACTION':
          legacy.setShowDayActionModal(modal.data);
          break;
        case 'DAY_ABILITY':
          legacy.setShowDayAbilityModal(modal.data);
          break;
        case 'SAINT_EXECUTION_CONFIRM':
          legacy.setShowSaintExecutionConfirmModal({ targetId: modal.data.targetId });
          break;
        case 'LUNATIC_RPS':
          legacy.setShowLunaticRpsModal(modal.data);
          break;
        case 'VIRGIN_TRIGGER':
          legacy.setShowVirginTriggerModal(modal.data);
          break;
        case 'VIRGIN_GUIDE':
          legacy.setVirginGuideInfo(modal.data);
          break;
        case 'DRUNK_CHARADE_SELECT':
          // Modal is handled directly in GameModals component
          break;
        case 'ROLE_SELECT':
          legacy.setShowRoleSelectModal(modal.data);
          break;
        case 'MADNESS_CHECK':
          legacy.setShowMadnessCheckModal(modal.data);
          break;
        case 'SHAMAN_CONVERT':
          legacy.setShowShamanConvertModal(true);
          break;
        case 'SPY_DISGUISE':
          legacy.setShowSpyDisguiseModal(true);
          break;
        case 'MAYOR_THREE_ALIVE':
          legacy.setShowMayorThreeAliveModal(true);
          break;
        case 'REVIEW':
          legacy.setShowReviewModal(true);
          break;
        case 'GAME_RECORDS':
          legacy.setShowGameRecordsModal(true);
          break;
        case 'ROLE_INFO':
          legacy.setShowRoleInfoModal(true);
          break;
        case 'RESTART_CONFIRM':
          legacy.setShowRestartConfirmModal(true);
          break;
        // 这些在 GameModals 里本就从 currentModal 读取（无需依赖 legacy）
        case 'NIGHT_ORDER_PREVIEW':
        case 'SHAMAN_CONVERT':
        case 'SPY_DISGUISE':
        case 'DAWN_REPORT':
        case 'GAME_OVER':
          break;
        default:
          break;
      }
    };

    // 1) 如果从一种 modal 切换到另一种 modal / 或关闭 modal，先清理上一种由 currentModal 同步出来的 legacy 状态
    if (prevType && prevType !== nextType) {
      clearLegacyFor(prevType);
    }

    // 2) 再同步当前 modal 对应的 legacy 状态
    if (base.currentModal) {
      syncLegacyFromCurrentModal(base.currentModal);
      lastSyncedModalTypeRef.current = base.currentModal.type;
      return;
    }

    lastSyncedModalTypeRef.current = null;
  }, [base.currentModal, deps]);

  return useMemo(() => {
    return {
      currentModal: base.currentModal,
      setCurrentModal: base.setCurrentModal,
      openModal,
      closeModal,
    };
  }, [base.currentModal, base.setCurrentModal, closeModal, openModal]);
}

