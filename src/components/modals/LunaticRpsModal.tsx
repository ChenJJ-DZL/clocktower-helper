import { ModalWrapper } from './ModalWrapper';

interface LunaticRpsModalProps {
  isOpen: boolean;
  nominatorId: number | null;
  targetId: number;
  onResolve: (lunaticLoses: boolean) => void;
}

export function LunaticRpsModal({ isOpen, nominatorId, targetId, onResolve }: LunaticRpsModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="✊✋✌️ 精神病患者被处决：石头剪刀布裁决"
      onClose={() => {}} // 不允许点击遮罩关闭
      closeOnOverlayClick={false}
      footer={
        <div className="w-full space-y-3">
          <button
            onClick={() => onResolve(true)}
            className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold"
          >
            精神病患者输（被处决）
          </button>
          <button
            onClick={() => onResolve(false)}
            className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold"
          >
            精神病患者赢/平（处决取消）
          </button>
        </div>
      }
      className="max-w-md"
    >
      <p className="text-lg text-gray-200">
        【精神病患者被处决】——现在你需要与提名者进行一次"石头剪刀布"的裁决。
      </p>
      <p className="text-sm text-gray-400 mt-2">
        提名者：{nominatorId !== null ? `${nominatorId+1}号` : '未知'} VS {targetId+1}号(精神病患者)
      </p>
      <p className="text-sm text-gray-400 mt-2">
        若精神病患者赢：他不死，提名他的人死亡；若精神病患者输：他才会被正常处决。
      </p>
    </ModalWrapper>
  );
}

