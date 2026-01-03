import { Seat } from '@/app/data';
import { ModalWrapper } from './ModalWrapper';

interface MoonchildKillModalProps {
  isOpen: boolean;
  sourceId: number;
  seats: Seat[];
  onConfirm: (targetId: number) => void;
}

export function MoonchildKillModal({ isOpen, sourceId, seats, onConfirm }: MoonchildKillModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="🌙 月之子已死"
      onClose={() => {}} // 不允许点击遮罩关闭
      closeOnOverlayClick={false}
      className="max-w-2xl border-purple-500"
    >
      <p className="text-lg text-gray-200 mb-4 text-center">请选择一名玩家与其陪葬</p>
      <div className="grid grid-cols-3 gap-3 max-h-[320px] overflow-y-auto">
        {seats
          .filter(s => !s.isDead && s.id !== sourceId)
          .map(s => (
            <button
              key={s.id}
              onClick={() => onConfirm(s.id)}
              className="p-3 border-2 border-purple-400 rounded-xl text-lg font-bold hover:bg-purple-900 transition-colors"
            >
              {s.id + 1}号 {s.role?.name ?? ''}
            </button>
          ))}
      </div>
    </ModalWrapper>
  );
}

