import { useMemo } from "react";
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
  const isMultiLine = result.includes("\n");
  const resultLines = useMemo(
    () => result.split("\n").filter((l) => l.trim().length > 0),
    [result]
  );

  // 计算最长一行的字符长度
  const maxLineLength = useMemo(() => {
    if (isMultiLine) {
      return resultLines.reduce((max, line) => Math.max(max, line.length), 0);
    }
    return result.length;
  }, [isMultiLine, resultLines, result]);

  // 根据文本长度智能调整字号，确保各类信息在一行内美观展示且不换行溢出
  const resultFontSize = useMemo(() => {
    if (isMultiLine) {
      if (maxLineLength > 28) {
        return "text-sm sm:text-base md:text-lg";
      }
      if (maxLineLength > 20) {
        return "text-base sm:text-lg md:text-xl";
      }
      if (maxLineLength > 12) {
        return "text-lg sm:text-xl md:text-2xl";
      }
      return "text-xl sm:text-2xl md:text-3xl";
    } else {
      if (maxLineLength > 30) {
        return "text-sm sm:text-base md:text-lg";
      }
      if (maxLineLength > 20) {
        return "text-base sm:text-lg md:text-xl";
      }
      if (maxLineLength > 12) {
        return "text-lg sm:text-xl md:text-2xl";
      }
      if (maxLineLength > 6) {
        return "text-xl sm:text-2xl md:text-3xl";
      }
      return "text-2xl sm:text-3xl md:text-4xl";
    }
  }, [isMultiLine, maxLineLength]);

  return (
    <ModalWrapper
      title={`${roleName} - 结果`}
      onClose={() => {}}
      className="max-w-xl sm:max-w-2xl w-full"
    >
      <div className="p-4 sm:p-6 text-white max-w-full overflow-hidden">
        <div className="text-center mb-6 space-y-4 max-w-full">
          {prefix && (
            <div className="text-base sm:text-lg md:text-xl text-amber-200/90 font-medium leading-relaxed break-words px-2">
              {prefix}
            </div>
          )}

          {isMultiLine ? (
            <div className="flex justify-center my-3 px-2 w-full overflow-hidden">
              <div
                className={`inline-block text-left font-black text-amber-400 tracking-wide leading-relaxed drop-shadow-md space-y-2.5 max-w-full break-words ${resultFontSize}`}
              >
                {resultLines.map((line, idx) => (
                  <div key={idx} className="break-words max-w-full">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              className={`font-black text-amber-400 tracking-wide text-center drop-shadow-md whitespace-pre-line break-words px-2 max-w-full ${resultFontSize}`}
            >
              {result}
            </div>
          )}

          <p className="text-xs sm:text-sm md:text-base text-gray-400 mt-3">
            请说书人向玩家告知以上信息
          </p>
        </div>
        <div className="flex gap-4 justify-center">
          <button
            onClick={onModify}
            className="px-5 sm:px-6 py-2.5 sm:py-3 font-bold text-white bg-gray-600 rounded-xl hover:bg-gray-500 transition shadow-md text-sm sm:text-base"
          >
            修改选择
          </button>
          <button
            onClick={onConfirm}
            className="px-5 sm:px-6 py-2.5 sm:py-3 font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-500 transition shadow-md text-sm sm:text-base"
          >
            确认结果
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
