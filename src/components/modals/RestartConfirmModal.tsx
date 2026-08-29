import { ModalWrapper } from "./ModalWrapper";

interface RestartConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RestartConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
}: RestartConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="🔄 确认重开对局"
      onClose={onCancel}
      size="fullscreen90"
      className="w-[94vw] max-w-7xl max-h-[92vh] flex flex-col p-3 overflow-hidden"
      footer={
        <div className="flex gap-4 w-full justify-center">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 max-w-xs py-3.5 sm:py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl font-bold text-base sm:text-lg text-slate-300 transition border border-slate-700 cursor-pointer active:scale-95"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 max-w-xs py-3.5 sm:py-4 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 rounded-2xl font-black text-base sm:text-lg text-white transition shadow-xl shadow-red-950/60 ring-2 ring-red-400 cursor-pointer active:scale-[0.98]"
          >
            确认重开
          </button>
        </div>
      }
    >
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-6 my-auto w-full">
        <div className="text-6xl sm:text-7xl">🔄</div>
        <div className="space-y-3 max-w-xl">
          <p className="text-3xl sm:text-4xl md:text-5xl font-black text-white leading-relaxed">
            确定要重开当前游戏吗？
          </p>
          <p className="text-sm sm:text-base text-slate-300">
            重开将清除当前对局的所有临时状态并记录至对局历史中。
          </p>
        </div>
      </div>
    </ModalWrapper>
  );
}
