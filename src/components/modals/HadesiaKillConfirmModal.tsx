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

/**
 * ⚔️ 哈迪寂亚（Al-Hadikhia）生死抉择
 * ----------------------------------------------------------------------------
 * 官方【角色能力】：「每个夜晚*，你可以选择三名玩家（所有玩家都会得知你选了谁）：
 *   他们分别**秘密**决定自己的生死，然后如果他们都存活则都死亡。」
 * 官方【运作方式】：三名玩家**依次**唤醒；前一名秘密做出选择后才公布下一位；
 *   所有玩家必须保持沉默。
 *
 * 设计决定（2026-10-22 用户明确）：
 * - **允许三人同屏**：说书人需要一屏看全三张卡，否则要来回翻，操作成本反而更高；
 * - 依次唤醒与静默由**说书人执行**（把设备依次递给三位玩家），
 *   所以页面顶部常驻一句操作提示，而不是把界面切成三步向导；
 * - 座位卡只显示「座位号 + 玩家名」，**不显示角色名**
 *   （所有玩家都会得知被选的是谁，但没人该知道他们的身份）。
 */
export function HadesiaKillConfirmModal({
  isOpen,
  targetIds,
  seats,
  choices,
  onSetChoice,
  onConfirm,
  onCancel,
}: HadesiaKillConfirmModalProps) {
  if (!isOpen || targetIds.length !== 3) return null;

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
            onClick={onConfirm}
          >
            确定
          </button>
        </div>
      }
    >
      <div className="flex flex-col flex-1 p-2 sm:p-4 space-y-4 my-auto w-full">
        <div className="text-base sm:text-lg md:text-xl text-gray-200 text-center font-bold">
          为三名玩家分别选择"生"或"死"。若三人都选"生"，则三人全部死亡。
        </div>
        {/*
         * 官方【运作方式】要求：依次唤醒、前一名选完才公布下一位、所有玩家保持沉默。
         * 这里不切三步向导（说书人要一屏看全），改为把「依次 + 静默」写成常驻提示，
         * 由说书人执行 —— 设备要一位一位递过去，不能三个人同时看这块屏幕。
         */}
        <div className="text-xs sm:text-sm text-amber-200 bg-amber-950/40 p-2.5 rounded-xl border border-amber-600/40 text-center leading-relaxed">
          ⚠️ 请把设备依次交给这三位玩家单独选择（前一位选完再给下一位），
          其余玩家保持沉默，不要围观。
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 my-auto">
          {targetIds.map((id) => {
            const seat = seats.find((s) => s.id === id);
            const choice = choices[id] || "live";
            return (
              <div
                key={id}
                data-testid="hadesia-target-card"
                className="bg-slate-800/90 border border-slate-700 rounded-2xl p-3 sm:p-4 space-y-3 shadow-md flex flex-col justify-between"
              >
                <div className="flex items-center justify-between text-white font-bold">
                  <span className="text-base sm:text-lg font-black">
                    <span className="text-amber-400">[{id + 1}号]</span>{" "}
                    {/* 🔒 只显示玩家名，角色名不渲染（谁被选中是公开信息，身份不是） */}
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
                    onClick={() => onSetChoice(id, "live")}
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
                    onClick={() => onSetChoice(id, "die")}
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
            );
          })}
        </div>
        <div className="text-xs sm:text-sm text-yellow-300 bg-yellow-950/40 p-3 rounded-xl border border-yellow-600/40 text-center">
          ⚠️
          规则：如果三名玩家全部选择"生"，则三人全部死亡；否则仅选择"死"的玩家立即死亡。
        </div>
      </div>
    </ModalWrapper>
  );
}
