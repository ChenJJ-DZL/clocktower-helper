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
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-6 my-auto">
        <div className="text-6xl sm:text-7xl md:text-8xl">
          {isPeacefulNight ? "🕊️" : "💀"}
        </div>
        <div className="space-y-3 max-w-3xl">
          <div className="text-base sm:text-xl text-slate-300 font-bold">
            说书人宣布黎明信息：
          </div>
          <div className="text-3xl sm:text-5xl md:text-6xl font-black text-amber-300 tracking-wider drop-shadow-2xl py-2">
            {message}
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
}
