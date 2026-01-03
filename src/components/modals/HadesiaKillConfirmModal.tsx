import { Seat } from '@/app/data';
import { ModalWrapper } from './ModalWrapper';

interface HadesiaKillConfirmModalProps {
  isOpen: boolean;
  targetIds: number[];
  seats: Seat[];
  choices: Record<number, 'live' | 'die'>;
  onSetChoice: (id: number, choice: 'live' | 'die') => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function HadesiaKillConfirmModal({
  isOpen,
  targetIds,
  seats,
  choices,
  onSetChoice,
  onConfirm,
  onCancel
}: HadesiaKillConfirmModalProps) {
  if (!isOpen || targetIds.length !== 3) return null;

  return (
    <ModalWrapper
      title="哈迪寂亚：决定命运"
      onClose={onCancel}
      footer={
        <>
          <button className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors" onClick={onCancel}>
            取消
          </button>
          <button className="px-4 py-2 bg-red-600 rounded font-bold hover:bg-red-700 transition-colors" onClick={onConfirm}>
            确定
          </button>
        </>
      }
      className="max-w-3xl border-red-500"
    >
      <div className="text-gray-200 mb-4">为三名玩家分别选择"生"或"死"。若三人都选"生"，则三人全部死亡。</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {targetIds.map(id => {
          const seat = seats.find(s => s.id === id);
          const choice = choices[id] || 'live';
          return (
            <div key={id} className="bg-gray-900 border border-gray-700 rounded px-3 py-2 space-y-2">
              <div className="flex items-center justify-between text-white font-bold">
                <span>[{id+1}] {seat?.role?.name || '未知'}</span>
                {seat?.isDead ? <span className="text-red-300 text-xs">已死</span> : <span className="text-green-300 text-xs">存活</span>}
              </div>
              <div className="flex gap-3 text-sm text-white">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    checked={choice === 'live'}
                    onChange={() => onSetChoice(id, 'live')}
                    className="cursor-pointer"
                  />
                  生
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    checked={choice === 'die'}
                    onChange={() => onSetChoice(id, 'die')}
                    className="cursor-pointer"
                  />
                  死
                </label>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-sm text-yellow-200 bg-yellow-900/30 p-3 rounded border border-yellow-600">
        规则：如果三名玩家全部选择"生"，则三人全部死亡；否则仅选择"死"的玩家立即死亡。
      </div>
    </ModalWrapper>
  );
}
