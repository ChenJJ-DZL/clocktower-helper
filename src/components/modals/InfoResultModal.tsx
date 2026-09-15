import { useMemo } from "react";
import {
  parseInfoResult,
  splitResultForDisplay,
} from "../../utils/infoResultParser";
import { AutoFitContent } from "../common/AutoFitContent";
import { ModalWrapper } from "./ModalWrapper";

export { parseInfoResult, splitResultForDisplay };

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
  // ⚠️ 2026-09-14：统一走 splitResultForDisplay —— 长单句按中文标点折成 2 行，
  //   多行结果原样保留。取代原先 isMultiLine 的二分支（那条单行分支用
  //   whitespace-nowrap 会把长句撑出弹窗被裁掉）。
  const resultLines = useMemo(
    () => splitResultForDisplay(result),
    [result]
  );
  const isMultiLine = resultLines.length > 1;
  // 原始就是多行（互认名单 / 两条信息等**列表型**内容）→ 保留左对齐；
  // 由展示层拆分出来的 2 行（**长单句折行**，如僧侣）→ 居中更好读。
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
      <AutoFitContent targetRatio={0.9} minScale={0.55} className="p-2 text-white">
        <div className="text-center my-auto space-y-4 max-w-[86vw] px-2 py-2">
          {prefix && (
            <div className="text-3xl sm:text-4xl md:text-5xl text-amber-200/90 font-bold leading-relaxed px-2">
              {prefix}
            </div>
          )}

          {/* ⚠️ 2026-09-13：多行结果**不能再用 `whitespace-nowrap` + `w-max`** ——
              只要有一行较长，AutoFitContent 就会把整块缩到很小（用户实测"字体太小"）。
              改为允许折行 + 限制最大宽度，字号整体上调，保证可读。
              ⚠️ 2026-09-14（僧侣）：单行分支原用 `whitespace-nowrap` → 长单句
              溢出弹窗被裁。现**两个分支都允许折行 + 限宽**，且长单句会被
              `splitResultForDisplay` 预先按中文标点折成 2 行，保证**完整显示在弹窗内**。 */}
          {isMultiLine ? (
            <div className="flex justify-center my-3 max-w-[86vw]">
              <div
                className={`inline-block ${
                  splitByDisplayLayer ? "text-center" : "text-left"
                } font-black text-amber-400 tracking-wide leading-relaxed drop-shadow-xl space-y-3 text-3xl sm:text-4xl md:text-5xl`}
              >
                {resultLines.map((line, idx) => (
                  <div key={idx} className="break-words">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="font-black text-amber-400 tracking-wider text-center drop-shadow-2xl whitespace-normal break-words max-w-[86vw] mx-auto px-2 my-4 text-4xl sm:text-5xl md:text-6xl">
              {resultLines[0] ?? result}
            </div>
          )}

          {/* ⚠️ P0 隐私（2026-09-13 用户截图指出）：本页给玩家看，
              原先这里有一行「请说书人向玩家告知以上信息」属于**说书人侧话术**，
              已删除；该类提示统一放 GameConsole 的「说书人Tips」。

              🌙 例外（同日，军团）：军团夜杀由说书人代操作，
              确认页与结果页**都只说书人可见**，故此处改为明确的"说书人专用"标注。 */}
          {storytellerFacing && (
            <div className="text-xs sm:text-sm text-amber-300 bg-amber-950/40 rounded-xl p-3 border border-amber-500/50">
              🎙️ 本页为**说书人专用**（军团代操作）：含真值与全员信息，请勿展示给玩家。
            </div>
          )}
        </div>
      </AutoFitContent>
    </ModalWrapper>
  );
}
