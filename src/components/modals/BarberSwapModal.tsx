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
      className="max-w-xl"
      footer={
        <div className="flex gap-3 justify-end w-full">
          <button
            className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition"
            onClick={() => props.setCurrentModal(null)}
          >
            取消
          </button>
          <button
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition"
            onClick={() => {
              if (
                modalData.firstId === null ||
                modalData.secondId === null ||
                modalData.firstId === modalData.secondId
              )
                return;
              const aId = modalData.firstId;
              const bId = modalData.secondId;
              const aSeat = props.seats.find((s: any) => s.id === aId);
              const bSeat = props.seats.find((s: any) => s.id === bId);
              if (!aSeat || !bSeat) return;
              const aRole = aSeat.role;
              const bRole = bSeat.role;
              props.setSeats((prev: any[]) =>
                prev.map((s: any) => {
                  if (s.id === aId) {
                    const swapped = props.cleanseSeatStatuses(
                      {
                        ...s,
                        role: bRole,
                        charadeRole: null,
                        isDemonSuccessor: false,
                      },
                      { keepDeathState: true }
                    );
                    return swapped;
                  }
                  if (s.id === bId) {
                    const swapped = props.cleanseSeatStatuses(
                      {
                        ...s,
                        role: aRole,
                        charadeRole: null,
                        isDemonSuccessor: false,
                      },
                      { keepDeathState: true }
                    );
                    return swapped;
                  }
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
      <div className="space-y-4">
        <div className="text-sm text-gray-300">
          恶魔（参考）：{modalData.demonId + 1}号
        </div>
        <select
          className="w-full bg-slate-800 border border-slate-600 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500"
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
            .filter((s: any) => s.role?.type !== "demon" && !s.isDemonSuccessor)
            .map((s: any) => (
              <option key={s.id} value={s.id}>
                [{s.id + 1}] {s.role?.name}
              </option>
            ))}
        </select>
        <select
          className="w-full bg-slate-800 border border-slate-600 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500"
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
            .filter((s: any) => s.role?.type !== "demon" && !s.isDemonSuccessor)
            .map((s: any) => (
              <option key={s.id} value={s.id}>
                [{s.id + 1}] {s.role?.name}
              </option>
            ))}
        </select>
      </div>
    </ModalWrapper>
  );
}
