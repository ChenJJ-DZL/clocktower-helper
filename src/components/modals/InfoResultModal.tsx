import { ModalWrapper } from "./ModalWrapper";

interface InfoResultModalProps {
  roleName: string;
  resultText: string;
  onConfirm: () => void;
  onModify: () => void;
}

export function InfoResultModal({
  roleName,
  resultText,
  onConfirm,
  onModify,
}: InfoResultModalProps) {
  return (
    <ModalWrapper title={`${roleName} - 结果`} onClose={() => {}}>
      <div className="p-6 text-white">
        <div className="text-center mb-6">
          <div className="text-5xl font-black mb-4 text-amber-400">
            {resultText}
          </div>
          <p className="text-lg text-gray-300">
            请说书人向玩家告知以上信息
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
