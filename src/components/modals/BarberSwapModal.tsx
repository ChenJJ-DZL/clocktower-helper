import { useGameActions } from "../../contexts/GameActionsContext";
import { ModalWrapper } from "./ModalWrapper";

export function BarberSwapModal() {
  const props = useGameActions();
  if (props.currentModal?.type !== "BARBER_SWAP") return null;
  const modalData = props.currentModal.data;

  return (
    <ModalWrapper
      title="💈 理发师：交换两名玩家角色"
      onClose={() => props.setCurrentModal(null)}
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
      footer={
        <div className="flex gap-4 justify-center w-full">
          <button
            className="flex-1 max-w-xs py-3 sm:py-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-base sm:text-lg transition shadow-md"
            onClick={() => props.setCurrentModal(null)}
          >
            取消
          </button>
          <button
            className="flex-1 max-w-xs py-3 sm:py-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-base sm:text-lg shadow-lg shadow-purple-600/40 ring-2 ring-purple-400 active:scale-[0.98] transition disabled:opacity-50"
            disabled={modalData.firstId === null || modalData.secondId === null}
            onClick={() => {
              const aId = modalData.firstId;
              const bId = modalData.secondId;
              if (aId === null || bId === null) return;
              const aSeat = props.seats.find((s: any) => s.id === aId);
              const bSeat = props.seats.find((s: any) => s.id === bId);
              if (!aSeat || !bSeat) return;
              const aRole = aSeat.role;
              const bRole = bSeat.role;
              props.setSeats((prev: any[]) =>
                prev.map((s: any) => {
                  if (s.id === aId) return { ...s, role: bRole };
                  if (s.id === bId) return { ...s, role: aRole };
                  return s;
                })
              );
              props.addLog(
                `理发师触发：交换了 ${aId + 1}号 与 ${bId + 1}号 的角色`
              );
              // 调整唤醒队列：如果当前在夜晚，将交换后的两名玩家插入唤醒队列
              if (["night", "firstNight"].includes(props.gamePhase)) {
                if (
                  aRole &&
                  ((aRole.firstNightOrder ?? 0) > 0 ||
                    (aRole.otherNightOrder ?? 0) > 0)
                ) {
                  props.insertIntoWakeQueueAfterCurrent(aId, {
                    roleOverride: aRole,
                    logLabel: `${aId + 1}号(${aRole.name})`,
                  });
                }
                if (
                  bRole &&
                  ((bRole.firstNightOrder ?? 0) > 0 ||
                    (bRole.otherNightOrder ?? 0) > 0)
                ) {
                  props.insertIntoWakeQueueAfterCurrent(bId, {
                    roleOverride: bRole,
                    logLabel: `${bId + 1}号(${bRole.name})`,
                  });
                }
              }
              props.setCurrentModal(null);
            }}
          >
            确认交换
          </button>
        </div>
      }
    >
      <div className="space-y-4 p-2 sm:p-4 flex flex-col flex-1 w-full">
        <div className="text-base sm:text-lg font-bold text-gray-200">
          恶魔（参考）：{modalData.demonId + 1}号
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs sm:text-sm text-slate-300 font-medium mb-1 block">
              玩家 A：
            </label>
            <select
              className="w-full bg-slate-800 border border-slate-600 rounded-xl p-3 text-white text-base sm:text-lg font-bold focus:outline-none focus:border-indigo-500"
              value={modalData.firstId ?? ""}
              onChange={(e) => {
                const current = props.currentModal;
                if (current?.type === "BARBER_SWAP") {
                  props.setCurrentModal({
                    ...current,
                    data: {
                      ...current.data,
                      firstId:
                        e.target.value === "" ? null : Number(e.target.value),
                    },
                  });
                }
              }}
            >
              <option value="">选择玩家A</option>
              {props.seats
                .filter(
                  (s: any) => s.role?.type !== "demon" && !s.isDemonSuccessor
                )
                .map((s: any) => (
                  <option key={s.id} value={s.id}>
                    [{s.id + 1}号] {s.role?.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="text-xs sm:text-sm text-slate-300 font-medium mb-1 block">
              玩家 B：
            </label>
            <select
              className="w-full bg-slate-800 border border-slate-600 rounded-xl p-3 text-white text-base sm:text-lg font-bold focus:outline-none focus:border-indigo-500"
              value={modalData.secondId ?? ""}
              onChange={(e) => {
                const current = props.currentModal;
                if (current?.type === "BARBER_SWAP") {
                  props.setCurrentModal({
                    ...current,
                    data: {
                      ...current.data,
                      secondId:
                        e.target.value === "" ? null : Number(e.target.value),
                    },
                  });
                }
              }}
            >
              <option value="">选择玩家B</option>
              {props.seats
                .filter(
                  (s: any) => s.role?.type !== "demon" && !s.isDemonSuccessor
                )
                .map((s: any) => (
                  <option key={s.id} value={s.id}>
                    [{s.id + 1}号] {s.role?.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
}
