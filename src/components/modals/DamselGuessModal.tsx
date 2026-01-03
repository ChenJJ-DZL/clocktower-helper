import { Seat } from '@/app/data';
import { ModalWrapper } from './ModalWrapper';

interface DamselGuessModalProps {
  isOpen: boolean;
  minionId: number | null;
  targetId: number | null;
  seats: Seat[];
  damselGuessUsedBy: number[];
  onMinionChange: (minionId: number | null) => void;
  onTargetChange: (targetId: number | null) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DamselGuessModal({
  isOpen,
  minionId,
  targetId,
  seats,
  damselGuessUsedBy,
  onMinionChange,
  onTargetChange,
  onConfirm,
  onCancel
}: DamselGuessModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="爪牙猜测落难少女"
      onClose={onCancel}
      footer={
        <>
          <button className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors" onClick={onCancel}>取消</button>
          <button
            className={`px-4 py-2 rounded font-bold transition-colors ${
              minionId === null || targetId === null
                ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                : 'bg-pink-600 hover:bg-pink-700'
            }`}
            onClick={onConfirm}
            disabled={minionId === null || targetId === null}
          >
            确定
          </button>
        </>
      }
      className="max-w-xl border-pink-500"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <select
          className="w-full bg-gray-900 border border-gray-700 rounded p-2"
          value={minionId ?? ''}
          onChange={e => onMinionChange(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">选择爪牙</option>
          {seats.filter(s => s.role?.type === 'minion' && !s.isDead && !damselGuessUsedBy.includes(s.id)).map(s => (
            <option key={s.id} value={s.id}>[{s.id+1}] {s.role?.name}</option>
          ))}
        </select>
        <select
          className="w-full bg-gray-900 border border-gray-700 rounded p-2"
          value={targetId ?? ''}
          onChange={e => onTargetChange(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">选择被猜测的玩家</option>
          {seats.filter(s => !s.isDead && (minionId === null || s.id !== minionId)).map(s => (
            <option key={s.id} value={s.id}>[{s.id+1}] {s.playerName || `座位${s.id+1}`}</option>
          ))}
        </select>
      </div>
    </ModalWrapper>
  );
}

