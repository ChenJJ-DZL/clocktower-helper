import { AutoFitContent } from "../common/AutoFitContent";
import { ModalWrapper } from "./ModalWrapper";

interface SaintExecutionConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SaintExecutionConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
}: SaintExecutionConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="⚠️ 圣徒处决警告"
      onClose={onCancel}
      size="fullscreen90"
      className="w-[94vw] max-w-7xl max-h-[92vh] flex flex-col p-3 overflow-hidden bg-red-950/90 border-red-600"
      footer={
        <div className="flex gap-4 w-full justify-center">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 max-w-xs py-3.5 sm:py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-lg sm:text-xl border border-slate-700 transition cursor-pointer active:scale-95 whitespace-nowrap"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 max-w-md py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-lg sm:text-xl shadow-xl shadow-red-950/70 ring-2 ring-red-400 cursor-pointer active:scale-[0.98] whitespace-nowrap"
          >
            确认处决圣徒并结束游戏
          </button>
        </div>
      }
    >
      <AutoFitContent targetRatio={0.9} minScale={0.2} className="p-2 sm:p-4 text-white">
        <div className="flex flex-col items-center justify-center text-center p-4 gap-6 my-auto w-max max-w-none">
          <div className="text-6xl sm:text-7xl md:text-8xl select-none">⚠️</div>
          <div className="space-y-4">
            <p className="text-3xl sm:text-4xl md:text-5xl font-black text-white whitespace-nowrap">
              你即将处决的是【圣徒 (Saint)】！
            </p>
            <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-red-300 leading-relaxed whitespace-nowrap">
              一旦执行，善良阵营立即失败，邪恶阵营立刻获胜！
            </p>
            <p className="text-base sm:text-xl text-red-200 mt-2 font-medium whitespace-nowrap">
              若你确认要执行，请点击下方【确认处决圣徒并结束游戏】。
            </p>
          </div>
        </div>
      </AutoFitContent>
    </ModalWrapper>
  );
}
