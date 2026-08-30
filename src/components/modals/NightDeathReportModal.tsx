import { AutoFitContent } from "../common/AutoFitContent";
import { ModalWrapper } from "./ModalWrapper";

interface NightDeathReportModalProps {
  message: string | null;
  onConfirm: () => void;
}

export function NightDeathReportModal({
  message,
  onConfirm,
}: NightDeathReportModalProps) {
  if (!message) return null;

  const isPeacefulNight =
    message.includes("平安夜") || message.includes("无人死亡");

  return (
    <ModalWrapper
      title="🌙 夜晚结算报告"
      onClose={onConfirm}
      size="fullscreen90"
      className="w-[94vw] max-w-7xl max-h-[92vh] flex flex-col p-3 overflow-hidden"
      footer={
        <div className="flex justify-center w-full">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full max-w-md py-3.5 sm:py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-2xl font-black text-lg sm:text-xl text-white transition shadow-xl shadow-emerald-950/60 ring-2 ring-emerald-400 active:scale-[0.98] cursor-pointer"
          >
            确认并进入白天
          </button>
        </div>
      }
    >
      <AutoFitContent targetRatio={0.85} className="p-4">
        <div className="flex flex-col items-center justify-center text-center p-4 gap-6">
          <div className="text-7xl sm:text-8xl">
            {isPeacefulNight ? "🕊️" : "💀"}
          </div>
          <div className="space-y-4 max-w-4xl">
            <div className="text-xl sm:text-2xl text-slate-300 font-bold whitespace-nowrap">
              说书人宣布黎明信息：
            </div>
            <div className="text-4xl sm:text-6xl font-black text-amber-300 tracking-wider drop-shadow-2xl py-2 whitespace-nowrap">
              {message}
            </div>
          </div>
        </div>
      </AutoFitContent>
    </ModalWrapper>
  );
}
