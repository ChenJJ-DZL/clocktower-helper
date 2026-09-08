import { AutoFitContent } from "../common/AutoFitContent";
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
          <div className="flex flex-row gap-3 w-full max-w-xl">
            <button
              type="button"
              onClick={onContinue}
              className="flex-1 py-2.5 sm:py-3.5 bg-amber-600 rounded-xl font-black text-sm sm:text-base md:text-lg text-white hover:bg-amber-500 transition shadow-md shadow-amber-600/40 ring-2 ring-amber-400 active:scale-[0.98] cursor-pointer whitespace-nowrap"
            >
              继续处决流程
            </button>
            <button
              type="button"
              onClick={onDeclareWin}
              className="flex-1 py-2.5 sm:py-3.5 bg-emerald-600 rounded-xl font-black text-sm sm:text-base md:text-lg text-white hover:bg-emerald-500 transition shadow-md shadow-emerald-600/40 ring-2 ring-emerald-400 active:scale-[0.98] cursor-pointer whitespace-nowrap"
            >
              宣告好人获胜
            </button>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-full max-w-sm py-2 sm:py-2.5 bg-slate-700 rounded-xl font-bold hover:bg-slate-600 transition text-xs sm:text-sm text-gray-300 cursor-pointer whitespace-nowrap"
          >
            先留在白天
          </button>
        </div>
      }
    >
      <AutoFitContent targetRatio={0.9} minScale={0.2} className="p-2 sm:p-4 text-white">
        <div className="flex flex-col items-center justify-center text-center space-y-4 my-auto w-max max-w-none px-6 py-4">
          <div className="text-5xl sm:text-6xl md:text-7xl select-none">🎩⚠️</div>
          <div className="space-y-3">
            <p className="text-3xl sm:text-4xl md:text-5xl font-black leading-relaxed whitespace-nowrap text-white">
              现在只剩 3 名玩家存活，且场上有【市长 (Mayor)】。
            </p>
            <p className="text-2xl sm:text-3xl md:text-4xl text-amber-300 font-bold leading-relaxed whitespace-nowrap">
              若今天最终没有任何玩家被处决，好人阵营将直接获胜。
            </p>
          </div>
          <div className="text-base sm:text-lg md:text-xl text-slate-200 bg-slate-800/90 px-8 py-5 rounded-2xl border border-white/15 space-y-2 text-left shadow-xl w-max max-w-none">
            <p className="font-bold text-amber-300 whitespace-nowrap">说书人裁决指引：</p>
            <p className="whitespace-nowrap">• 继续本日处决流程；</p>
            <p className="whitespace-nowrap">• 或立即宣告好人获胜（若你已经决定今天不再处决任何人）。</p>
          </div>
        </div>
      </AutoFitContent>
    </ModalWrapper>
  );
}
