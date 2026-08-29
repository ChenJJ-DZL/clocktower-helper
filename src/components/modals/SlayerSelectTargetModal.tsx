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
  const selectedSeat =
    selectedTarget !== null ? seats.find((s) => s.id === selectedTarget) : null;

  const getFactionBadge = (type?: string) => {
    switch (type) {
      case "townsfolk":
        return {
          label: "镇民",
          color: "bg-blue-500/20 text-blue-300 border-blue-500/40",
        };
      case "outsider":
        return {
          label: "外来者",
          color: "bg-teal-500/20 text-teal-300 border-teal-500/40",
        };
      case "minion":
        return {
          label: "爪牙",
          color: "bg-amber-500/20 text-amber-300 border-amber-500/40",
        };
      case "demon":
        return {
          label: "恶魔",
          color: "bg-red-500/20 text-red-300 border-red-500/40",
        };
      default:
        return {
          label: "玩家",
          color: "bg-slate-500/20 text-slate-300 border-slate-500/40",
        };
    }
  };

  return (
    <ModalWrapper
      title="💥 猎手射击 - 选择目标"
      onClose={() => {
        setSelectedTarget(null);
        onCancel();
      }}
      size="fullscreen90"
      className="w-[94vw] max-w-7xl max-h-[92vh] flex flex-col p-3 overflow-hidden"
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={() => {
              setSelectedTarget(null);
              onCancel();
            }}
            className="px-6 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-bold text-sm transition active:scale-95 cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedTarget === null) return;
              onConfirm(selectedTarget);
              setSelectedTarget(null);
            }}
            disabled={selectedTarget === null}
            className="px-8 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-sm shadow-lg shadow-red-950/60 ring-2 ring-red-400 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer flex items-center gap-2"
          >
            <span>💥</span>
            <span>确认射击</span>
          </button>
        </div>
      }
    >
      <div className="flex-1 flex flex-col gap-3 text-slate-200 overflow-hidden min-h-0">
        {/* 顶部射击者信息与规则说明 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800 gap-2 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎯</span>
            <div>
              <div className="text-sm font-bold text-slate-300">
                射击发起者：
                <strong className="text-white font-black text-base ml-1">
                  {shooter
                    ? `${shooter.id + 1}号 ${shooter.playerName ? `(${shooter.playerName})` : ""} - 【${shooter.role?.name || "猎手"}】`
                    : "未知"}
                </strong>
              </div>
              <div className="text-xs text-amber-300/90 mt-0.5">
                规则说明：整局游戏限一次。公开选择一名玩家开枪。如果目标是恶魔，该恶魔立即死亡，善良阵营获胜！
              </div>
            </div>
          </div>
        </div>

        {/* 目标玩家选择网格 */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {seats
              .filter((s) => s.role && s.id !== shooterId)
              .map((s) => {
                const isSelected = selectedTarget === s.id;
                const isDead = s.isDead;
                const factionBadge = getFactionBadge(s.role?.type);

                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={isDead}
                    onClick={() => !isDead && setSelectedTarget(s.id)}
                    className={`p-3.5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between gap-2 cursor-pointer ${
                      isDead
                        ? "border-slate-800/80 bg-slate-900/40 text-slate-600 opacity-60 cursor-not-allowed"
                        : isSelected
                          ? "border-red-500 bg-red-950/70 text-white shadow-xl shadow-red-950/80 ring-2 ring-red-400 scale-[1.02]"
                          : "border-slate-800 bg-slate-900/80 text-slate-200 hover:border-slate-700 hover:bg-slate-800/80"
                    }`}
                    title={isDead ? "目标已死亡" : `选择 ${s.id + 1}号`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="w-6 h-6 rounded-full border border-slate-700 bg-slate-800 text-xs font-mono font-bold flex items-center justify-center text-amber-400">
                        {s.id + 1}
                      </span>
                      {isDead ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700">
                          💀 已死亡
                        </span>
                      ) : (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${factionBadge.color}`}
                        >
                          {factionBadge.label}
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="font-black text-base text-slate-100 truncate">
                        {s.role?.name}
                      </div>
                      {s.playerName && (
                        <div className="text-xs text-slate-400 truncate">
                          {s.playerName}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        {/* 当前锁定目标提示条 */}
        {selectedSeat && (
          <div className="px-4 py-2.5 rounded-xl bg-red-950/40 border border-red-500/50 text-red-200 text-sm font-bold flex items-center justify-between shrink-0 shadow-lg">
            <div className="flex items-center gap-2">
              <span className="text-base">🎯</span>
              <span>
                已锁定目标：
                <strong className="text-white text-base ml-1">
                  【{selectedSeat.id + 1}号 - {selectedSeat.role?.name}
                  {selectedSeat.playerName
                    ? ` (${selectedSeat.playerName})`
                    : ""}
                  】
                </strong>
              </span>
            </div>
            <span className="text-xs text-red-300/80 font-normal">
              点击下方“确认射击”完成结算
            </span>
          </div>
        )}
      </div>
    </ModalWrapper>
  );
}
