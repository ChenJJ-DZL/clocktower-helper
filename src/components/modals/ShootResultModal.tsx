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
          className="px-12 py-4 bg-green-600 rounded-xl font-bold text-xl hover:bg-green-700 transition-colors"
        >
          确认
        </button>
      }
      className={`max-w-md ${isDemonDead ? "border-red-500" : "border-yellow-500"}`}
    >
      <p className="text-2xl font-bold text-white text-center">{message}</p>
    </ModalWrapper>
  );
}
