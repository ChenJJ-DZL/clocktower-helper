import { AutoFitContent } from "../common/AutoFitContent";
import { ModalWrapper } from "./ModalWrapper";

interface PacifistConfirmModalProps {
  isOpen: boolean;
  targetId: number;
  onResolve: (saved: boolean) => void;
}

export function PacifistConfirmModal({
  isOpen,
  targetId,
  onResolve,
}: PacifistConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="🕊️ 和平主义者裁定"
      onClose={() => onResolve(false)}
      closeOnOverlayClick={false}
      size="fullscreen90"
      className="w-[94vw] max-w-7xl max-h-[92vh] flex flex-col p-3 overflow-hidden"
      footer={
        <div className="flex gap-4 w-full justify-center">
          <button
            type="button"
            onClick={() => onResolve(false)}
            className="flex-1 max-w-xs py-3.5 sm:py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl font-bold text-lg sm:text-xl text-slate-300 transition border border-slate-700 cursor-pointer active:scale-95"
          >
            正常处决
          </button>
          <button
            type="button"
            onClick={() => onResolve(true)}
            className="flex-1 max-w-xs py-3.5 sm:py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-2xl font-black text-lg sm:text-xl text-white transition shadow-xl shadow-emerald-950/60 ring-2 ring-emerald-400 cursor-pointer active:scale-[0.98]"
          >
            本次处决免死
          </button>
        </div>
      }
    >
      <AutoFitContent targetRatio={0.85} className="p-4">
        <div className="flex flex-col items-center justify-center text-center p-4 gap-6 my-auto w-full text-white">
          <div className="text-7xl sm:text-8xl">🕊️</div>
          <div className="space-y-4 max-w-4xl">
            <p className="text-3xl sm:text-5xl font-black leading-relaxed">
              <span className="text-amber-400 font-black">
                【{targetId + 1}号】
              </span>{" "}
              镇民被处决：
              <br />
              是否触发【和平主义者】使其免于死亡？
            </p>
            <p className="text-lg sm:text-xl text-slate-300 font-medium leading-relaxed">
              规则：和平主义者让“被处决的镇民可能不会死亡”，由说书人裁定（通常随机）。
            </p>
          </div>
        </div>
      </AutoFitContent>
    </ModalWrapper>
  );
}
