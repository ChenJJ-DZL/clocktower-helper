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
    <ModalWrapper title="占卜师 - 结果" onClose={() => {}}>
      <div className="p-6 text-white">
        <div className="text-center mb-6 space-y-3">
          <div className="text-xl md:text-2xl text-amber-200/90 font-medium leading-relaxed">
            占卜师（目标：{targetLabels.join("、")}号）得知所选玩家是否有恶魔：
          </div>
          <div
            className={`text-4xl md:text-5xl font-black ${resultColor} tracking-wide text-center drop-shadow-md`}
          >
            {resultText}
          </div>
          <p className="text-base text-gray-400 mt-2">
            请说书人向玩家告知以上信息（{resultDesc}）
          </p>
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={onModify}
            className="px-6 py-3 font-bold text-white bg-gray-600 rounded-lg hover:bg-gray-500 transition"
          >
            修改选择
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-3 font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition"
          >
            确认结果
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
