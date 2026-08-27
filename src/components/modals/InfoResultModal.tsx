import { parseInfoResult } from "../../utils/infoResultParser";
import { ModalWrapper } from "./ModalWrapper";

export { parseInfoResult };

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
  const { prefix, result } = parseInfoResult(resultText, roleName);

  return (
    <ModalWrapper title={`${roleName} - 结果`} onClose={() => {}}>
      <div className="p-6 text-white">
        <div className="text-center mb-6 space-y-3">
          {prefix && (
            <div className="text-xl md:text-2xl text-amber-200/90 font-medium leading-relaxed">
              {prefix}
            </div>
          )}
          <div className="text-3xl md:text-4xl font-black text-amber-400 tracking-wide text-center drop-shadow-md">
            {result}
          </div>
          <p className="text-base text-gray-400 mt-3">
            请说书人向玩家告知以上信息
          </p>
        </div>
        <div className="flex gap-4 justify-center">
          <button
            onClick={onModify}
            className="px-6 py-3 font-bold text-white bg-gray-600 rounded-xl hover:bg-gray-500 transition shadow-md"
          >
            修改选择
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-3 font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-500 transition shadow-md"
          >
            确认结果
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
