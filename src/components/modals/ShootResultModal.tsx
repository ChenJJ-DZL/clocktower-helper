import { ModalWrapper } from "./ModalWrapper";

interface ShootResultModalProps {
  isOpen: boolean;
  message: string;
  isDemonDead: boolean;
  onConfirm: () => void;
}

export function ShootResultModal({
  isOpen,
  message,
  isDemonDead,
  onConfirm,
}: ShootResultModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title={isDemonDead ? "💥 恶魔死亡" : "💥 开枪结果"}
      onClose={onConfirm}
      footer={
        <button
          onClick={onConfirm}
          className="px-12 py-4 bg-green-600 rounded-xl font-bold text-xl hover:bg-green-700 transition-colors shadow-md"
        >
          确认
        </button>
      }
      className={`max-w-md ${isDemonDead ? "border-red-500" : "border-yellow-500"}`}
    >
      <div className="text-center py-2 space-y-3">
        <div className="text-xl text-amber-200/90 font-medium">开枪结算结果：</div>
        <div className="text-3xl font-black text-amber-400 text-center tracking-wide drop-shadow-md">
          {message.startsWith("【") ? message : `【${message}】`}
        </div>
      </div>
    </ModalWrapper>
  );
}
