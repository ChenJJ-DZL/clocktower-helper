import { ModalWrapper } from "./ModalWrapper";

interface FortuneTellerResultModalProps {
  result: boolean;
  targetLabels: string[];
  onConfirm: () => void;
  onModify: () => void;
}

export function FortuneTellerResultModal({
  result,
  targetLabels,
  onConfirm,
  onModify,
}: FortuneTellerResultModalProps) {
  const resultText = result ? "【是】" : "【否】";
  const resultDesc = result
    ? "所选两名玩家之中有恶魔（或红罗刹）"
    : "所选两名玩家之中没有恶魔";
  const resultColor = result ? "text-red-400" : "text-emerald-400";

  return (
    <ModalWrapper
      title="🔮 占卜师 - 结果"
      onClose={() => {}}
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
      footer={
        <div className="flex gap-4 w-full justify-center">
          <button
            onClick={onModify}
            className="flex-1 max-w-xs py-3 sm:py-4 font-bold text-white bg-slate-700 rounded-xl hover:bg-slate-600 transition shadow-md text-base sm:text-lg"
          >
            修改选择
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 max-w-xs py-3 sm:py-4 font-black text-white bg-blue-600 rounded-xl hover:bg-blue-500 transition shadow-lg text-base sm:text-lg shadow-blue-600/40 ring-2 ring-blue-400 active:scale-[0.98]"
          >
            确认结果
          </button>
        </div>
      }
    >
      <div className="p-2 sm:p-6 text-white flex flex-col flex-1 my-auto w-full">
        <div className="text-center my-auto space-y-4">
          <div className="text-lg sm:text-xl md:text-2xl text-amber-200/90 font-bold leading-relaxed">
            占卜师（目标：{targetLabels.join("、")}号）得知所选玩家是否有恶魔：
          </div>
          <div
            className={`text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black ${resultColor} tracking-widest text-center drop-shadow-2xl my-4`}
          >
            {resultText}
          </div>
          <p className="text-sm sm:text-base md:text-lg text-gray-300 font-medium mt-2">
            请说书人向玩家告知以上信息（{resultDesc}）
          </p>
        </div>
      </div>
    </ModalWrapper>
  );
}
