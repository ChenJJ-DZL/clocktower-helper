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

  // 提取纯结果词（如“无事发生”或“恶魔死亡，善良阵营获胜”）
  let resultText = message || "无事发生";
  if (resultText.startsWith("【") && resultText.endsWith("】")) {
    resultText = resultText.slice(1, -1);
  }

  // 描述文本：xx阶段向xx号玩家开枪，结果：
  const actionDescription =
    detail ||
    `${phaseText ? `${phaseText}` : "白天阶段"}${
      targetId !== undefined && targetId !== null
        ? `向【${targetId + 1}号】玩家开枪，`
        : ""
    }结果：`;

  return (
    <ModalWrapper
      title={isDemonDead ? "💥 恶魔死亡" : "💥 开枪结果"}
      onClose={onConfirm}
      footer={
        <button
          onClick={onConfirm}
          className="px-12 py-3 bg-green-600 rounded-xl font-bold text-lg hover:bg-green-700 transition-colors shadow-md cursor-pointer"
        >
          确认
        </button>
      }
      className={`max-w-md ${isDemonDead ? "border-red-500" : "border-yellow-500"}`}
    >
      <div className="text-center py-2 space-y-4">
        <div className="text-base sm:text-lg text-amber-200/90 font-medium px-2 leading-relaxed">
          {actionDescription}
        </div>
        <div className="text-3xl sm:text-4xl font-black text-amber-400 text-center tracking-wider drop-shadow-md py-1">
          【{resultText}】
        </div>
      </div>
    </ModalWrapper>
  );
}
