import { useEffect } from "react";
import { ModalWrapper } from "./ModalWrapper";

interface PoisonConfirmModalProps {
  targetId: number | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PoisonConfirmModal({
  targetId,
  onConfirm,
  onCancel,
}: PoisonConfirmModalProps) {
  console.log("[PoisonConfirmModal] Component called with targetId:", targetId);
  console.log("[PoisonConfirmModal] targetId type:", typeof targetId);
  console.log("[PoisonConfirmModal] targetId === null:", targetId === null);
  console.log("[PoisonConfirmModal] targetId !== null:", targetId !== null);

  // CRITICAL: Use useEffect to verify modal is actually in DOM
  useEffect(() => {
    // Only run if we are actually rendering the modal (targetId is not null)
    if (targetId === null || targetId === undefined) return;

    const checkModal = () => {
      // Check for modal by data attribute
      const modalsByKey = document.querySelectorAll("[data-modal-key]");
      console.log(
        "[PoisonConfirmModal] Found modals by data-modal-key:",
        modalsByKey.length
      );

      // Check for modal by z-index
      const allDivs = document.querySelectorAll("div");
      const modalsByZIndex = Array.from(allDivs).filter((div) => {
        const style = window.getComputedStyle(div);
        return (
          style.zIndex === "2147483647" ||
          parseInt(style.zIndex, 10) === 2147483647
        );
      });
      console.log(
        "[PoisonConfirmModal] Found modals by z-index:",
        modalsByZIndex.length
      );

      // Check for modal by title text
      const modalsByTitle = document.querySelectorAll("h2");
      const poisonModals = Array.from(modalsByTitle).filter((h2) =>
        h2.textContent?.includes("确认下毒")
      );
      console.log(
        "[PoisonConfirmModal] Found modals by title:",
        poisonModals.length
      );

      // Log all found modals
      [...modalsByKey, ...modalsByZIndex].forEach((modal, idx) => {
        const rect = modal.getBoundingClientRect();
        const style = window.getComputedStyle(modal);
        console.log(`[PoisonConfirmModal] Modal ${idx}:`, {
          element: modal,
          tagName: modal.tagName,
          position: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            visible: rect.width > 0 && rect.height > 0,
          },
          styles: {
            zIndex: style.zIndex,
            position: style.position,
            display: style.display,
            opacity: style.opacity,
            visibility: style.visibility,
            pointerEvents: style.pointerEvents,
          },
        });
      });
    };

    // Check immediately and after delays
    checkModal();
    const timer1 = setTimeout(checkModal, 100);
    const timer2 = setTimeout(checkModal, 500);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [targetId]);

  if (targetId === null || targetId === undefined) return null;

  return (
    <ModalWrapper
      title="🧪 确认下毒"
      onClose={onCancel}
      footer={
        <>
          <button
            onClick={() => {
              console.log("[PoisonConfirmModal] Cancel button clicked");
              onCancel();
            }}
            className="px-8 py-4 bg-gray-600 rounded-xl font-bold text-xl hover:bg-gray-700 transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => {
              console.log(
                "[PoisonConfirmModal] Confirm button clicked for target:",
                targetId
              );
              onConfirm();
            }}
            className="px-8 py-4 bg-purple-600 rounded-xl font-bold text-xl hover:bg-purple-700 transition-colors"
          >
            确认
          </button>
        </>
      }
      className="max-w-md"
    >
      <p className="text-2xl font-bold text-white text-center">
        确认对{targetId + 1}号玩家下毒吗？
      </p>
    </ModalWrapper>
  );
}
