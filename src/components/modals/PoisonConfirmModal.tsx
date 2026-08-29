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
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
      footer={
        <div className="flex gap-4 w-full justify-center">
          <button
            onClick={() => {
              console.log("[PoisonConfirmModal] Cancel button clicked");
              onCancel();
            }}
            className="flex-1 max-w-xs py-3 sm:py-4 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-base sm:text-lg text-white transition shadow-md"
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
            className="flex-1 max-w-xs py-3 sm:py-4 bg-purple-600 hover:bg-purple-500 rounded-xl font-black text-base sm:text-lg text-white transition shadow-lg shadow-purple-600/40 ring-2 ring-purple-400 active:scale-[0.98]"
          >
            确认
          </button>
        </div>
      }
    >
      <div className="flex flex-col flex-1 p-2 sm:p-6 space-y-4 text-center my-auto w-full">
        <p className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white leading-relaxed">
          确认对{" "}
          <span className="text-amber-400 font-black">
            【{targetId + 1}号】
          </span>{" "}
          玩家下毒吗？
        </p>
      </div>
    </ModalWrapper>
  );
}
