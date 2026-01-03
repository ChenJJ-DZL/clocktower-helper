import { Seat } from '@/app/data';
import { ModalWrapper } from './ModalWrapper';

interface KlutzChoiceModalProps {
  isOpen: boolean;
  sourceId: number;
  seats: Seat[];
  selectedTarget: number | null;
  onSelectTarget: (targetId: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function KlutzChoiceModal({
  isOpen,
  sourceId,
  seats,
  selectedTarget,
  onSelectTarget,
  onConfirm,
  onCancel
}: KlutzChoiceModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="🤪 呆瓜死亡判定"
      onClose={onCancel}
      footer={
        <>
          <button className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors" onClick={onCancel}>
            取消
          </button>
          <button 
            className={`px-4 py-2 rounded font-bold transition-colors ${
              selectedTarget === null
                ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                : 'bg-yellow-600 hover:bg-yellow-500'
            }`}
            onClick={onConfirm}
            disabled={selectedTarget === null}
          >
            确认
          </button>
        </>
      }
      className="max-w-3xl border-yellow-500"
    >
      <p className="text-lg text-gray-200 mb-4 text-center">请选择一名存活玩家：若其为邪恶，善良阵营立即失败。</p>
      <div className="grid grid-cols-3 gap-3 max-h-[360px] overflow-y-auto">
        {seats.filter(s => !s.isDead && s.id !== sourceId).map(s => (
          <label key={s.id} className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded px-2 py-1 cursor-pointer hover:bg-gray-800 transition-colors">
            <input
              type="radio"
              name="klutz-choice"
              checked={selectedTarget === s.id}
              onChange={() => onSelectTarget(s.id)}
              className="cursor-pointer"
            />
            <span>[{s.id+1}] {s.role?.name || '未知'}</span>
          </label>
        ))}
      </div>
    </ModalWrapper>
  );
}

