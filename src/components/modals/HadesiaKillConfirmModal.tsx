import { useEffect, useState } from "react";
import type { Seat } from "@/app/data";
import { ModalWrapper } from "./ModalWrapper";

interface HadesiaKillConfirmModalProps {
  isOpen: boolean;
  targetIds: number[];
  seats: Seat[];
  choices: Record<number, "live" | "die">;
  onSetChoice: (id: number, choice: "live" | "die") => void;
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
  onCancel,
}: HadesiaKillConfirmModalProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (isOpen) setStep(0);
  }, [isOpen]);

  if (!isOpen || targetIds.length !== 3) return null;

  const currentId = targetIds[step];
  const seat = seats.find((s) => s.id === currentId);
  const choice = choices[currentId] || "live";
  const isLast = step >= targetIds.length - 1;

  return (
    <ModalWrapper
      title="⚔️ 哈迪寂亚：决定命运"
      onClose={onCancel}
      size="fullscreen90"
      className="w-[90vw] h-[90vh] border-red-500"
      footer={
        <div className="flex gap-6 w-full justify-center">
          <button
            className="flex-1 max-w-xs py-4 sm:py-5 bg-slate-700 hover:bg-slate-600 rounded-2xl font-bold text-lg sm:text-xl text-white transition shadow-lg"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="flex-1 max-w-xs py-4 sm:py-5 bg-red-600 hover:bg-red-500 rounded-2xl font-black text-lg sm:text-xl text-white transition shadow-xl shadow-red-600/40 ring-2 ring-red-400 active:scale-[0.98]"
            onClick={() => {
              if (isLast) {
                onConfirm();
              } else {
                setStep(step + 1);
              }
            }}
          >
            {isLast ? "确定" : "下一位"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col flex-1 p-2 sm:p-4 space-y-4 my-auto w-full">
        <div className="text-base sm:text-lg md:text-xl text-gray-200 text-center font-bold">
          请让【当前这位】玩家单独操作。三名玩家将依次秘密选择"生"或"死"；若三人都选"生"，则三人全部死亡。
        </div>
        <div className="text-sm sm:text-base text-amber-300 text-center font-bold">
          第 {step + 1} / {targetIds.length} 位
        </div>
        <div className="w-full max-w-md mx-auto">
          <div
            data-testid="hadesia-current-target"
            className="bg-slate-800/90 border border-slate-700 rounded-2xl p-3 sm:p-4 space-y-3 shadow-md flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-white font-bold">
              <span className="text-base sm:text-lg font-black">
                <span className="text-amber-400">[{currentId + 1}号]</span>{" "}
                {seat?.playerName ?? ""}
              </span>
              {seat?.isDead ? (
                <span className="text-red-400 text-xs font-semibold px-2 py-0.5 bg-red-950/60 rounded-full border border-red-800">
                  已死
                </span>
              ) : (
                <span className="text-emerald-400 text-xs font-semibold px-2 py-0.5 bg-emerald-950/60 rounded-full border border-emerald-800">
                  存活
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onSetChoice(currentId, "live")}
                className={`flex-1 py-2 sm:py-2.5 rounded-xl font-black text-sm sm:text-base transition-all border ${
                  choice === "live"
                    ? "bg-emerald-600 border-emerald-400 text-white shadow-md shadow-emerald-600/40 ring-2 ring-emerald-400"
                    : "bg-slate-900/60 border-slate-700 text-slate-400 hover:text-white"
                }`}
              >
                生
              </button>
              <button
                type="button"
                onClick={() => onSetChoice(currentId, "die")}
                className={`flex-1 py-2 sm:py-2.5 rounded-xl font-black text-sm sm:text-base transition-all border ${
                  choice === "die"
                    ? "bg-red-600 border-red-400 text-white shadow-md shadow-red-600/40 ring-2 ring-red-400"
                    : "bg-slate-900/60 border-slate-700 text-slate-400 hover:text-white"
                }`}
              >
                死
              </button>
            </div>
          </div>
        </div>
        <div className="text-xs sm:text-sm text-yellow-300 bg-yellow-950/40 p-3 rounded-xl border border-yellow-600/40 text-center">
          ⚠️
          规则：如果三名玩家全部选择"生"，则三人全部死亡；否则仅选择"死"的玩家立即死亡。
        </div>
      </div>
    </ModalWrapper>
  );
}
