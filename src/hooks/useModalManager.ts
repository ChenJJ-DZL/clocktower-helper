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
