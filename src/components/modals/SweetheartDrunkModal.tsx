import { Seat } from '@/app/data';
import { ModalWrapper } from './ModalWrapper';

interface SweetheartDrunkModalProps {
  isOpen: boolean;
  sourceId: number;
  seats: Seat[];
  onConfirm: (targetId: number) => void;
}

export function SweetheartDrunkModal({ isOpen, sourceId, seats, onConfirm }: SweetheartDrunkModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="💕 心上人致醉"
      onClose={() => {}} // 不允许点击遮罩关闭
      closeOnOverlayClick={false}
      className="max-w-3xl border-pink-500"
    >
      <p className="text-lg text-gray-200 mb-4 text-center">请选择一名玩家，在今晚至次日黄昏期间醉酒。</p>
      <div className="grid grid-cols-3 gap-3 max-h-[360px] overflow-y-auto">
        {seats
          .filter(s => !s.isDead)
          .map(s => (
            <button
              key={s.id}
              onClick={() => onConfirm(s.id)}
              className="p-3 border-2 border-pink-400 rounded-xl text-lg font-bold hover:bg-pink-900 transition-colors"
            >
              {s.id + 1}号 {s.role?.name ?? ''}
            </button>
          ))}
      </div>
    </ModalWrapper>
  );
}

