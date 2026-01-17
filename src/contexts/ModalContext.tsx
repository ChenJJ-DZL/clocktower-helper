"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { ModalType, Z_INDEX } from "../types/modal";

/**
 * Modal优先级定义
 * 数字越大优先级越高
 */
export const MODAL_PRIORITY = {
  LOW: 1,           // 信息展示类弹窗
  NORMAL: 2,         // 普通操作弹窗
  HIGH: 3,           // 确认类弹窗
  CRITICAL: 4,       // 关键操作弹窗（如处决确认）
} as const;

/**
 * Modal管理器状态
 */
interface ModalState {
  currentModal: ModalType;
  priority: number;
  id: string; // 用于追踪弹窗
}

/**
 * Modal管理器上下文
 */
interface ModalContextType {
  showModal: (modal: ModalType, priority?: number) => void;
  hideModal: () => void;
  currentModal: ModalType;
  isModalOpen: boolean;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

/**
 * ModalProvider - 全局Modal管理器
 * 确保同一时间只有一个最高优先级的弹窗显示
 */
export function ModalProvider({ children }: { children: ReactNode }) {
  const [modalStack, setModalStack] = useState<ModalState[]>([]);

  /**
   * 显示弹窗
   * @param modal 弹窗数据
   * @param priority 优先级（默认 NORMAL）
   */
  const showModal = useCallback((modal: ModalType, priority: number = MODAL_PRIORITY.NORMAL) => {
    if (!modal) {
      console.warn('[ModalProvider] Attempted to show null modal');
      return;
    }

    const modalId = `${modal.type}-${Date.now()}`;
    const newModal: ModalState = {
      currentModal: modal,
      priority,
      id: modalId,
    };

    setModalStack(prev => {
      // 移除相同类型的弹窗（避免重复）
      const filtered = prev.filter(m => m.currentModal?.type !== modal.type);
      
      // 添加新弹窗
      const updated = [...filtered, newModal];
      
      // 按优先级排序，优先级高的在前
      updated.sort((a, b) => b.priority - a.priority);
      
      console.log('[ModalProvider] Modal stack updated:', updated.map(m => ({
        type: m.currentModal?.type,
        priority: m.priority,
      })));
      
      return updated;
    });
  }, []);

  /**
   * 隐藏弹窗
   * 如果指定了类型，只隐藏该类型的弹窗；否则隐藏最高优先级的弹窗
   */
  const hideModal = useCallback((modalType?: string) => {
    setModalStack(prev => {
      if (modalType) {
        // 隐藏指定类型的弹窗
        const filtered = prev.filter(m => m.currentModal?.type !== modalType);
        console.log('[ModalProvider] Hiding modal type:', modalType, 'Remaining:', filtered.length);
        return filtered;
      } else {
        // 隐藏最高优先级的弹窗
        if (prev.length > 0) {
          const [, ...rest] = prev;
          console.log('[ModalProvider] Hiding top modal, remaining:', rest.length);
          return rest;
        }
        return prev;
      }
    });
  }, []);

  // 当前显示的弹窗（最高优先级的）
  const currentModal = modalStack.length > 0 ? modalStack[0].currentModal : null;
  const isModalOpen = modalStack.length > 0;

  return (
    <ModalContext.Provider value={{ showModal, hideModal, currentModal, isModalOpen }}>
      {children}
    </ModalContext.Provider>
  );
}

/**
 * useModal - 使用Modal管理器的Hook
 */
export function useModal() {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}

/**
 * 便捷函数：显示不同类型的弹窗
 */
export const modalHelpers = {
  /**
   * 显示确认击杀弹窗
   */
  showKillConfirm: (targetId: number, isImpSelfKill: boolean = false, showModal: (modal: ModalType, priority?: number) => void) => {
    showModal({
      type: 'KILL_CONFIRM',
      data: { targetId, isImpSelfKill },
    }, MODAL_PRIORITY.CRITICAL);
  },

  /**
   * 显示投毒确认弹窗
   */
  showPoisonConfirm: (targetId: number, showModal: (modal: ModalType, priority?: number) => void) => {
    showModal({
      type: 'POISON_CONFIRM',
      data: { targetId },
    }, MODAL_PRIORITY.HIGH);
  },

  /**
   * 显示夜晚死亡报告
   */
  showNightDeathReport: (message: string, showModal: (modal: ModalType, priority?: number) => void) => {
    showModal({
      type: 'NIGHT_DEATH_REPORT',
      data: { message },
    }, MODAL_PRIORITY.HIGH);
  },

  /**
   * 显示处决结果
   */
  showExecutionResult: (message: string, showModal: (modal: ModalType, priority?: number) => void, isVirginTrigger?: boolean) => {
    showModal({
      type: 'EXECUTION_RESULT',
      data: { message, isVirginTrigger },
    }, MODAL_PRIORITY.HIGH);
  },

  /**
   * 显示攻击被阻挡弹窗
   */
  showAttackBlocked: (targetId: number, reason: string, showModal: (modal: ModalType, priority?: number) => void, demonName?: string) => {
    showModal({
      type: 'ATTACK_BLOCKED',
      data: { targetId, reason, demonName },
    }, MODAL_PRIORITY.NORMAL);
  },
};

