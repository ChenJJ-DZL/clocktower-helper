import React, { useState, useEffect } from 'react';
import { Seat } from '../../../app/data';

interface SlayerSelectTargetModalProps {
  isOpen: boolean;
  shooterId: number;
  seats: Seat[];
  onConfirm: (targetId: number) => void;
  onCancel: () => void;
}

export function SlayerSelectTargetModal({
  isOpen,
  shooterId,
  seats,
  onConfirm,
  onCancel,
}: SlayerSelectTargetModalProps) {
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null);

  useEffect(() => {
    setSelectedTarget(null);
  }, [shooterId]);

  if (!isOpen) return null;

  const shooter = seats.find(s => s.id === shooterId);

  return (
    <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-2xl text-center border-2 border-red-500 relative w-[720px] max-h-[90vh] overflow-y-auto">
        <h3 className="text-3xl font-bold mb-4">💥 猎手射击 - 选择目标</h3>
        <div className="mb-4 text-sm text-gray-200 leading-relaxed">
          <div>射击者：{shooter ? `${shooter.id + 1}号 ${shooter.playerName || ''}` : '未知'}</div>
          <div className="text-xs text-yellow-300 mt-2">
            规则：选择一名玩家进行射击。如果目标是恶魔，恶魔死亡，善良阵营获胜。
          </div>
          <div className="text-xs text-yellow-200 mt-1">
            注意：如果猎手处于中毒或醉酒状态，即使选中恶魔也不会产生效果。
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {seats.filter(s => s.role && s.id !== shooterId).map(s => {
            const isSelected = selectedTarget === s.id;
            const isDead = s.isDead;
            return (
              <button
                key={s.id}
                type="button"
                disabled={isDead}
                onClick={() => !isDead && setSelectedTarget(s.id)}
                className={`p-3 rounded-xl border-2 text-left transition ${
                  isDead
                    ? 'border-gray-700 bg-gray-900/50 text-gray-500 cursor-not-allowed'
                    : isSelected
                      ? 'border-red-400 bg-red-900/60 text-white shadow-lg shadow-red-500/30'
                      : 'border-slate-600 bg-slate-800/80 text-slate-100 hover:bg-slate-700'
                }`}
                title={isDead ? '目标已死亡' : `选择 ${s.id + 1}号`}
              >
                <div className="flex justify-between items-center">
                  <div className="font-bold">{s.id + 1}号 {s.playerName || ''}</div>
                  <div className="text-xs text-gray-300">
                    {isDead ? '💀 已死亡' : '存活'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mb-4 text-sm text-gray-100">
          {selectedTarget !== null && (
            <div className="text-lg font-bold text-red-300">
              已选择目标：{seats.find(s => s.id === selectedTarget)?.id !== undefined 
                ? `${selectedTarget + 1}号`
                : '未知'}
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <button 
            onClick={() => {
              if (selectedTarget === null) {
                alert('请先选择一个目标');
                return;
              }
              onConfirm(selectedTarget);
              setSelectedTarget(null);
            }}
            disabled={selectedTarget === null}
            className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold shadow disabled:opacity-50 disabled:cursor-not-allowed"
          >
            确认射击
          </button>
          <button 
            onClick={() => {
              setSelectedTarget(null);
              onCancel();
            }}
            className="px-6 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-xl font-bold shadow"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

