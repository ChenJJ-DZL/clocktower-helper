import { useMemo } from "react";
import {
  parseInfoResult,
  splitResultForDisplay,
} from "../../utils/infoResultParser";
import { AutoFitContent, SKILL_PAGE_AUTOFIT } from "../common/AutoFitContent";
import { ModalWrapper } from "./ModalWrapper";

export { parseInfoResult, splitResultForDisplay };

/**
 * 将多行结果解析为"标题-内容"对，供多信息页（恶魔互认/爪牙互认等）统一排版。
 * 每行按首个冒号拆分：冒号左侧为 title，右侧为 value。
 * 无冒号的行只有 value，title 为空。
 */
function parseItemsForDisplay(
  lines: string[]
): Array<{ title: string; value: string }> {
  return lines.map((line) => {
    const colonIdx = line.indexOf(":");
    const fullColonIdx = line.indexOf("：");
    const idx =
      colonIdx === -1
        ? fullColonIdx
        : fullColonIdx === -1
          ? colonIdx
          : Math.min(colonIdx, fullColonIdx);
    if (idx > 0) {
      return { title: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    }
    return { title: "", value: line.trim() };
  });
}

interface InfoResultModalProps {
  roleName: string;
  resultText: string;
  onConfirm: () => void;
  onModify: () => void;
  /**
   * 🌙 说书人专用结果页（军团夜杀）。
   *
   * 军团玩家无需操作、由说书人代为决定"今晚谁死"，且军团局邪恶方本就互相知情，
   * 故该页**只说书人可见**，展示真值不算泄漏。置 true 时在页脚标注"说书人专用"。
   */
  storytellerFacing?: boolean;
}

export function InfoResultModal({
  roleName,
  resultText,
  onConfirm,
  onModify,
  storytellerFacing,
}: InfoResultModalProps) {
  const { prefix, result } = parseInfoResult(resultText, roleName);
  const resultLines = useMemo(() => splitResultForDisplay(result), [result]);
  const isMultiLine = resultLines.length > 1;

  // 多信息页（恶魔互认/爪牙互认等）：每行按首个冒号拆成标题-内容对，
  // 统一字号、每条消息 = 1行标题 + 1行内容。
  const displayItems = useMemo(
    () => (isMultiLine ? parseItemsForDisplay(resultLines) : null),
    [isMultiLine, resultLines]
  );
  const hasItemPattern =
    displayItems !== null &&
    displayItems.length > 1 &&
    displayItems.some((it) => it.title);

  // 非 item 模式的多行：原始多行（无冒号列表）左对齐；展示层折行居中。
  const splitByDisplayLayer = !result.includes("\n") && isMultiLine;

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
      <AutoFitContent
        {...SKILL_PAGE_AUTOFIT}
        className="p-0 text-white"
      >
        <div className="text-center my-auto space-y-2 max-w-full px-0 py-1">
          {prefix && (
            <div className="text-lg sm:text-xl md:text-2xl text-amber-200/90 font-bold leading-tight px-1">
              {prefix}
            </div>
          )}

          {hasItemPattern ? (
            /* 多信息页：每条消息 = 标题行 + 内容行，所有条目统一字号 */
            <div className="space-y-3 my-1 max-w-full">
              {displayItems!.map((item, idx) => (
                <div key={idx} className="font-black text-amber-400 tracking-wide leading-tight drop-shadow-xl text-3xl sm:text-4xl md:text-5xl">
                  {item.title && (
                    <div className="text-amber-200/80">{item.title}</div>
                  )}
                  <div>{item.value}</div>
                </div>
              ))}
            </div>
          ) : isMultiLine ? (
            <div className="flex justify-center my-1 max-w-full">
              <div
                className={`inline-block ${
                  splitByDisplayLayer ? "text-center" : "text-left"
                } font-black text-amber-400 tracking-wide leading-tight drop-shadow-xl space-y-1 text-3xl sm:text-4xl md:text-5xl`}
              >
                {resultLines.map((line, idx) => (
                  <div key={idx} className="break-words">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="font-black text-amber-400 tracking-wider text-center drop-shadow-2xl break-words max-w-full mx-auto px-0 my-1 text-4xl sm:text-5xl md:text-6xl">
              {resultLines[0] ?? result}
            </div>
          )}

          {storytellerFacing && (
            <div className="text-xs sm:text-sm text-amber-300 bg-amber-950/40 rounded-xl p-3 border border-amber-500/50">
              🎙️
              本页为**说书人专用**（军团代操作）：含真值与全员信息，请勿展示给玩家。
            </div>
          )}
        </div>
      </AutoFitContent>
    </ModalWrapper>
  );
}
