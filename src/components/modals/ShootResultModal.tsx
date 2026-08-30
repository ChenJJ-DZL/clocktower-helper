import { AutoFitContent } from "../common/AutoFitContent";
import { ModalWrapper } from "./ModalWrapper";

interface ShootResultModalProps {
  isOpen: boolean;
  message: string;
  isDemonDead?: boolean;
  targetId?: number;
  shooterId?: number;
  phaseText?: string;
  detail?: string;
  onConfirm: () => void;
}

export function ShootResultModal({
  isOpen,
  message,
  isDemonDead = false,
  targetId,
  phaseText,
  detail,
  onConfirm,
}: ShootResultModalProps) {
  if (!isOpen) return null;

  let resultText = message || "无事发生";
  if (resultText.startsWith("【") && resultText.endsWith("】")) {
    resultText = resultText.slice(1, -1);
  }

  const actionDescription =
    detail ||
    `猎手 在 ${phaseText ? `${phaseText}` : "白天阶段"}${
      targetId !== undefined && targetId !== null
        ? ` 向【${targetId + 1}号】玩家开枪：`
        : " 开枪射击结果："
    }`;

  return (
    <ModalWrapper
      title={isDemonDead ? "💥 恶魔死亡 - 善良阵营获胜！" : "💥 猎手射击结果"}
      onClose={onConfirm}
      size="fullscreen90"
      className={`w-[94vw] max-w-7xl max-h-[92vh] flex flex-col p-3 overflow-hidden ${
        isDemonDead
          ? "border-2 border-red-500/80"
          : "border-2 border-amber-500/60"
      }`}
      footer={
        <div className="flex justify-center w-full">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full max-w-md py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl font-black text-lg shadow-xl shadow-emerald-950/60 ring-2 ring-emerald-400 active:scale-[0.98] transition cursor-pointer"
          >
            确认并返回
          </button>
        </div>
      }
    >
      <AutoFitContent targetRatio={0.85} className="p-4">
        <div className="flex flex-col items-center justify-center text-center p-4 gap-6 my-auto">
          <div className="text-7xl sm:text-8xl animate-bounce">
            {isDemonDead ? "🏆" : "💨"}
          </div>

          <div className="space-y-3 max-w-3xl">
            <div className="text-lg sm:text-xl text-slate-300 font-bold leading-relaxed whitespace-nowrap">
              {actionDescription}
            </div>
            <div
              className={`text-4xl sm:text-6xl font-black tracking-wide drop-shadow-2xl py-2 whitespace-nowrap ${
                isDemonDead
                  ? "text-red-400 font-black"
                  : "text-amber-300 font-black"
              }`}
            >
              【{resultText}】
            </div>
          </div>

          {isDemonDead && (
            <div className="p-4 rounded-2xl bg-red-950/50 border border-red-500/50 text-red-200 text-base sm:text-lg font-bold max-w-xl shadow-lg whitespace-nowrap">
              🎉 恶魔已被猎手成功击杀！系统已判定善良阵营获得最终胜利！
            </div>
          )}
        </div>
      </AutoFitContent>
    </ModalWrapper>
  );
}
