import { ModalWrapper } from './ModalWrapper';

interface AttackBlockedModalProps {
  isOpen: boolean;
  targetId: number;
  reason: string;
  demonName?: string;
  onClose: () => void;
}

export function AttackBlockedModal({ isOpen, targetId, reason, demonName, onClose }: AttackBlockedModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="⚔️ 攻击无效"
      onClose={onClose}
      footer={
        <button
          className="w-full py-3 bg-green-600 hover:bg-green-500 rounded-xl text-xl font-bold"
          onClick={onClose}
        >
          知道了
        </button>
      }
      className="max-w-md"
    >
      <div className="text-gray-100 text-lg text-center">
        {demonName
          ? `恶魔【${demonName}】攻击 ${targetId + 1}号，但因为【${reason}】，该玩家未死亡。`
          : `${targetId + 1}号因【${reason}】未受到本次攻击的影响。`}
      </div>
      <div className="text-xs text-gray-400 text-center mt-2">
        请根据规则继续进行后续流程。本弹窗仅作提示，不会影响结算。
      </div>
    </ModalWrapper>
  );
}

