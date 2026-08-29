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
        return "text-lg sm:text-xl md:text-2xl lg:text-3xl";
      }
      if (maxLineLength > 20) {
        return "text-xl sm:text-2xl md:text-3xl lg:text-4xl";
      }
      if (maxLineLength > 12) {
        return "text-2xl sm:text-3xl md:text-4xl lg:text-5xl";
      }
      return "text-3xl sm:text-4xl md:text-5xl lg:text-6xl";
    } else {
      if (maxLineLength > 30) {
        return "text-xl sm:text-2xl md:text-3xl lg:text-4xl";
      }
      if (maxLineLength > 20) {
        return "text-2xl sm:text-3xl md:text-4xl lg:text-5xl";
      }
      if (maxLineLength > 12) {
        return "text-3xl sm:text-4xl md:text-5xl lg:text-6xl";
      }
      if (maxLineLength > 6) {
        return "text-4xl sm:text-5xl md:text-6xl lg:text-7xl";
      }
      return "text-5xl sm:text-6xl md:text-7xl lg:text-8xl";
    }
  }, [isMultiLine, maxLineLength]);

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
      <div className="p-2 sm:p-6 text-white w-full flex flex-col flex-1 my-auto">
        <div className="text-center my-auto space-y-4 max-w-full">
          {prefix && (
            <div className="text-lg sm:text-xl md:text-2xl text-amber-200/90 font-bold leading-relaxed break-words px-2">
              {prefix}
            </div>
          )}

          {isMultiLine ? (
            <div className="flex justify-center my-4 px-2 w-full">
              <div
                className={`inline-block text-left font-black text-amber-400 tracking-wide leading-relaxed drop-shadow-xl space-y-3 max-w-full break-words ${resultFontSize}`}
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
              className={`font-black text-amber-400 tracking-wider text-center drop-shadow-2xl whitespace-pre-line break-words px-2 max-w-full my-4 ${resultFontSize}`}
            >
              {result}
            </div>
          )}

          <p className="text-sm sm:text-base md:text-lg text-gray-300 mt-4 font-medium">
            请说书人向玩家告知以上信息
          </p>
        </div>
      </div>
    </ModalWrapper>
  );
}
