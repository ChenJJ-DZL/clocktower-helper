import { AutoFitContent } from "../common/AutoFitContent";
import { ModalWrapper } from "./ModalWrapper";

interface ExecutionResultModalProps {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
}

export function ExecutionResultModal({
  isOpen,
  message,
  onConfirm,
}: ExecutionResultModalProps) {
  if (!isOpen) return null;

  const isNoDeath =
    message.includes("无人") ||
    message.includes("不死") ||
    message.includes("未被处决") ||
    message.includes("存活");

  return (
    <ModalWrapper
      title="⚖️ 处决结果判定"
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
            确认
          </button>
        </div>
      }
    >
      <AutoFitContent targetRatio={0.9} minScale={0.7} className="p-2 sm:p-4">
        <div className="flex flex-col items-center justify-center text-center p-2 sm:p-4 gap-3 sm:gap-5 w-full max-w-4xl mx-auto my-auto">
          <div className={`${message.includes("\n") ? "text-5xl sm:text-6xl" : "text-6xl sm:text-8xl"} select-none`}>
            {isNoDeath ? "🕊️" : "⚖️"}
          </div>
          <div className="space-y-3 sm:space-y-4 w-full">
            <div className="text-base sm:text-xl text-slate-400 font-bold tracking-wider">
              今日处决最终判定结果
            </div>
            {message.includes("\n") ? (
              <div className="flex flex-col items-center gap-2.5 sm:gap-3.5 w-full max-w-3xl mx-auto bg-slate-900/60 p-4 sm:p-6 rounded-2xl border border-slate-700/60 shadow-inner">
                {message.split("\n").map((line, idx) => {
                  const trimmed = line.trim();
                  if (!trimmed) return null;
                  const isFirst = idx === 0;
                  const isSecond = idx === 1;
                  return (
                    <div
                      key={idx}
                      className={`font-black tracking-wide leading-relaxed drop-shadow-md break-words ${
                        isFirst
                          ? "text-xl sm:text-2xl md:text-3xl text-amber-300"
                          : isSecond
                            ? "text-lg sm:text-xl md:text-2xl text-rose-400 font-black"
                            : "text-sm sm:text-lg md:text-xl text-sky-300 font-bold"
                      }`}
                    >
                      {trimmed}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-3xl sm:text-5xl font-black text-amber-300 tracking-wider drop-shadow-2xl py-2 leading-relaxed">
                {message.startsWith("【") ? message : `【${message}】`}
              </div>
            )}
          </div>
        </div>
      </AutoFitContent>
    </ModalWrapper>
  );
}
