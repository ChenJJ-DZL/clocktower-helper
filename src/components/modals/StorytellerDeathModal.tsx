import { Seat } from '@/app/data';
import { ModalWrapper } from './ModalWrapper';

interface StorytellerDeathModalProps {
  isOpen: boolean;
  sourceId: number;
  seats: Seat[];
  onConfirm: (targetId: number | null) => void;
}

export function StorytellerDeathModal({ isOpen, sourceId, seats, onConfirm }: StorytellerDeathModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="📖 说书人决定今晚死亡"
      onClose={() => {}} // 不允许点击遮罩关闭
      closeOnOverlayClick={false}
      footer={
        <button
          onClick={() => onConfirm(null)}
          className="w-full px-6 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-100 font-bold transition-colors"
        >
          本晚无人死亡（高级裁决）
        </button>
      }
      className="max-w-3xl border-red-500"
    >
      <p className="text-lg text-gray-200 mb-2 text-center">
        麻脸巫婆造出新恶魔后，请指定今晚死亡的玩家（可选择"无人死亡"）。
      </p>
      <p className="text-sm text-red-300 mb-4 text-center">
        你通过麻脸巫婆创造了一个新恶魔。按规则，本晚通常必须有人死亡（除非你有意让这是一个特殊裁决）。
      </p>
      <div className="grid grid-cols-3 gap-3 max-h-[360px] overflow-y-auto">
        {seats
          .filter(s => !s.isDead)
          .map(s => (
            <button
              key={s.id}
              onClick={() => onConfirm(s.id)}
              className="p-3 border-2 border-red-400 rounded-xl text-lg font-bold hover:bg-red-900 transition-colors"
            >
              {s.id + 1}号 {s.role?.name ?? ''}
            </button>
          ))}
      </div>
    </ModalWrapper>
  );
}

