"use client";

import React from "react";
import { useModal } from "../contexts/ModalContext";
import { ModalType } from "../types/modal";
import { GameModals } from "./game/GameModals";

/**
 * 全局Modal渲染器
 * 统一管理所有弹窗的显示，确保同一时间只有一个最高优先级的弹窗
 * 
 * 使用方式：
 * 1. 在组件中调用 useModal() 获取 showModal 函数
 * 2. 调用 showModal({ type: 'KILL_CONFIRM', data: {...} })
 * 3. 弹窗会自动显示，关闭时调用 hideModal()
 */
export function GlobalModalRenderer({ controller }: { controller: any }) {
  const { currentModal, hideModal } = useModal();

  // 将 currentModal 传递给 GameModals
  // GameModals 会根据 currentModal 的类型渲染对应的弹窗组件
  return (
    <GameModals
      {...controller}
      currentModal={currentModal}
      setCurrentModal={(modal: ModalType) => {
        // 如果设置为 null，则隐藏弹窗
        if (!modal) {
          hideModal();
        } else {
          // 否则通过 ModalContext 显示（这里需要从 controller 中获取 showModal）
          // 注意：这里可能需要调整，因为 showModal 在 ModalContext 中
          // 暂时保持兼容，使用 controller.setCurrentModal
          controller.setCurrentModal?.(modal);
        }
      }}
    />
  );
}

