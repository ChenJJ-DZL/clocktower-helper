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
  const resultText = result ? "是" : "否";
  const resultDesc = result
    ? "你选择的两名玩家之中有恶魔！"
    : "你选择的两名玩家之中没有恶魔。";
  const resultColor = result ? "text-red-400" : "text-green-400";

  return (
    <ModalWrapper title="占卜结果" onClose={() => {}}>
      <div className="p-6 text-white">
        <div className="text-center mb-6">
          <div className={`text-6xl font-black mb-4 ${resultColor}`}>
            {resultText}
          </div>
          <p className="text-lg">{resultDesc}</p>
          <p className="text-sm text-gray-400 mt-2">
            目标玩家：{targetLabels.join("、")}号
          </p>
        </div>

        <p className="text-center text-sm text-gray-500 mb-6">
          说书人将会通过对你点头或摇头来告知结果。
        </p>

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
