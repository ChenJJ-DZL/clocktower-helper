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
      <AutoFitContent targetRatio={0.88} className="p-2">
        <div className="flex flex-col items-center justify-center text-center p-2 gap-6 w-full max-w-4xl mx-auto">
          <div className="text-6xl sm:text-8xl">{isNoDeath ? "🕊️" : "⚖️"}</div>
          <div className="space-y-4 w-full">
            <div className="text-lg sm:text-2xl text-slate-400 font-bold">
              今日处决最终判定结果
            </div>
            {message.includes("\n") ? (
              <div className="flex flex-col items-center gap-3 w-full">
                {message.split("\n").map((line, idx) => {
                  const trimmed = line.trim();
                  if (!trimmed) return null;
                  const isFirst = idx === 0;
                  const isSecond = idx === 1;
                  return (
                    <div
                      key={idx}
                      className={`font-black tracking-wide leading-relaxed drop-shadow-xl ${
                        isFirst
                          ? "text-2xl sm:text-4xl text-amber-300"
                          : isSecond
                            ? "text-xl sm:text-3xl text-rose-400 font-extrabold"
                            : "text-base sm:text-2xl text-slate-300"
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
