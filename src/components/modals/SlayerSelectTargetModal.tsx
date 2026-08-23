import { useEffect, useState } from "react";
import type { Seat } from "../../../app/data";
import { ModalWrapper } from "./ModalWrapper";

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
  }, []);

  if (!isOpen) return null;

  const shooter = seats.find((s) => s.id === shooterId);

  return (
    <ModalWrapper
      title="💥 猎手射击 - 选择目标"
      onClose={() => {
        setSelectedTarget(null);
        onCancel();
      }}
      className="max-w-2xl"
      footer={
        <div className="flex gap-3 justify-end w-full">
          <button
            onClick={() => {
              setSelectedTarget(null);
              onCancel();
            }}
            className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition"
          >
            取消
          </button>
          <button
            onClick={() => {
              if (selectedTarget === null) return;
              onConfirm(selectedTarget);
              setSelectedTarget(null);
            }}
            disabled={selectedTarget === null}
            className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold shadow disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            确认射击
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="text-sm text-slate-200 leading-relaxed bg-slate-800/60 p-3 rounded-xl border border-white/5">
          <div>
            射击者：
            <strong className="text-white">
              {shooter
                ? `${shooter.id + 1}号 ${shooter.playerName || ""}`
                : "未知"}
            </strong>
          </div>
          <div className="text-xs text-yellow-300 mt-1">
            规则：选择一名玩家进行射击。如果目标是恶魔，恶魔死亡，善良阵营获胜。
          </div>
          <div className="text-xs text-yellow-200/80 mt-0.5">
            注意：如果猎手处于中毒或醉酒状态，即使选中恶魔也不会产生效果。
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {seats
            .filter((s) => s.role && s.id !== shooterId)
            .map((s) => {
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
                      ? "border-slate-800 bg-slate-900/50 text-slate-600 cursor-not-allowed"
                      : isSelected
                        ? "border-red-400 bg-red-900/60 text-white shadow-lg shadow-red-500/30"
                        : "border-slate-700 bg-slate-800/80 text-slate-100 hover:bg-slate-700"
                  }`}
                  title={isDead ? "目标已死亡" : `选择 ${s.id + 1}号`}
                >
                  <div className="flex justify-between items-center">
                    <div className="font-bold">
                      {s.id + 1}号 {s.role?.name}
                    </div>
                    {isDead && (
                      <span className="text-xs text-slate-500">已死亡</span>
                    )}
                  </div>
                </button>
              );
            })}
        </div>

        {selectedTarget !== null && (
          <div className="text-center text-base font-bold text-red-300 py-1">
            已选择目标：
            {seats.find((s) => s.id === selectedTarget)?.id !== undefined
              ? `${selectedTarget + 1}号 (${seats.find((s) => s.id === selectedTarget)?.role?.name})`
              : "未知"}
          </div>
        )}
      </div>
    </ModalWrapper>
  );
}
