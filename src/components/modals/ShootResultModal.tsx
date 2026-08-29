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
  isDemonDead,
  targetId,
  shooterId: _shooterId,
  phaseText,
  detail,
  onConfirm,
}: ShootResultModalProps) {
  if (!isOpen) return null;

  // 提取纯结果词（如“无事发生”或“恶魔死亡，善良阵营获胜！”）
  let resultText = message || "无事发生";
  if (resultText.startsWith("【") && resultText.endsWith("】")) {
    resultText = resultText.slice(1, -1);
  }

  // 描述文本：xx阶段向xx号玩家开枪，结果：
  const actionDescription =
    detail ||
    `${phaseText ? `${phaseText}` : "白天阶段"}${
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
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-6 my-auto">
        <div className="text-6xl sm:text-7xl md:text-8xl animate-bounce">
          {isDemonDead ? "🏆" : "💨"}
        </div>

        <div className="space-y-2 max-w-2xl">
          <div className="text-base sm:text-lg text-slate-300 font-bold leading-relaxed">
            {actionDescription}
          </div>
          <div
            className={`text-3xl sm:text-4xl md:text-5xl font-black tracking-wide drop-shadow-2xl py-2 ${
              isDemonDead
                ? "text-red-400 font-black"
                : "text-amber-300 font-black"
            }`}
          >
            【{resultText}】
          </div>
        </div>

        {isDemonDead && (
          <div className="p-4 rounded-2xl bg-red-950/50 border border-red-500/50 text-red-200 text-sm sm:text-base font-bold max-w-xl shadow-lg">
            🎉 恶魔已被猎手成功击杀！系统已判定善良阵营获得最终胜利！
          </div>
        )}
      </div>
    </ModalWrapper>
  );
}
