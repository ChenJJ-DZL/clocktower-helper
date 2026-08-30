import { useMemo } from "react";
import { parseInfoResult } from "../../utils/infoResultParser";
import { AutoFitContent } from "../common/AutoFitContent";
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
  const isMultiLine = result.includes("\n");
  const resultLines = useMemo(
    () => result.split("\n").filter((l) => l.trim().length > 0),
    [result]
  );

  return (
    <ModalWrapper
      title={`${roleName} - 结果`}
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
      <AutoFitContent targetRatio={0.9} className="p-2 text-white">
        <div className="text-center my-auto space-y-4 w-max max-w-none px-2 py-2">
          {prefix && (
            <div className="text-2xl sm:text-3xl md:text-4xl text-amber-200/90 font-bold leading-relaxed whitespace-nowrap px-2">
              {prefix}
            </div>
          )}

          {isMultiLine ? (
            <div className="flex justify-center my-3 w-max max-w-none">
              <div className="inline-block text-left font-black text-amber-400 tracking-wide leading-relaxed drop-shadow-xl space-y-3 whitespace-nowrap text-2xl sm:text-3xl md:text-4xl">
                {resultLines.map((line, idx) => (
                  <div key={idx} className="whitespace-nowrap">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="font-black text-amber-400 tracking-wider text-center drop-shadow-2xl whitespace-nowrap px-2 my-4 text-4xl sm:text-5xl md:text-6xl">
              {result}
            </div>
          )}

          <p className="text-base sm:text-lg md:text-xl text-gray-300 mt-4 font-medium whitespace-nowrap">
            请说书人向玩家告知以上信息
          </p>
        </div>
      </AutoFitContent>
    </ModalWrapper>
  );
}
