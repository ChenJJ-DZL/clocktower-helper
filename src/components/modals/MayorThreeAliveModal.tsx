import { ModalWrapper } from "./ModalWrapper";

interface MayorThreeAliveModalProps {
  isOpen: boolean;
  onContinue: () => void;
  onDeclareWin: () => void;
  onCancel: () => void;
}

export function MayorThreeAliveModal({
  isOpen,
  onContinue,
  onDeclareWin,
  onCancel,
}: MayorThreeAliveModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="⚠️ 市长 3 人存活提醒"
      onClose={onCancel}
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
      footer={
        <div className="flex flex-col gap-3 w-full justify-center items-center">
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xl">
            <button
              onClick={onContinue}
              className="flex-1 py-3 sm:py-4 bg-amber-600 rounded-xl font-black text-base sm:text-lg text-white hover:bg-amber-500 transition shadow-md shadow-amber-600/40 ring-2 ring-amber-400 active:scale-[0.98]"
            >
              继续处决流程
            </button>
            <button
              onClick={onDeclareWin}
              className="flex-1 py-3 sm:py-4 bg-emerald-600 rounded-xl font-black text-base sm:text-lg text-white hover:bg-emerald-500 transition shadow-md shadow-emerald-600/40 ring-2 ring-emerald-400 active:scale-[0.98]"
            >
              宣告好人获胜
            </button>
          </div>
          <button
            onClick={onCancel}
            className="w-full max-w-sm py-2 sm:py-2.5 bg-slate-700 rounded-xl font-bold hover:bg-slate-600 transition text-xs sm:text-sm text-gray-300"
          >
            先留在白天
          </button>
        </div>
      }
    >
      <div className="flex flex-col flex-1 p-2 sm:p-6 space-y-4 text-center text-gray-100 my-auto w-full">
        <p className="text-xl sm:text-2xl md:text-3xl font-black leading-relaxed">
          现在只剩 3 名玩家存活，且场上有【市长 (Mayor)】。
        </p>
        <p className="text-base sm:text-xl md:text-2xl text-amber-300 font-bold leading-relaxed">
          若今天最终没有任何玩家被处决，好人阵营将直接获胜。
        </p>
        <div className="text-xs sm:text-sm md:text-base text-slate-300 space-y-1 mt-2">
          <p className="font-semibold text-slate-200">你可以选择：</p>
          <p>• 继续本日处决流程；</p>
          <p>• 或立即宣告好人获胜（若你已经决定今天不再处决任何人）。</p>
        </div>
      </div>
    </ModalWrapper>
  );
}
