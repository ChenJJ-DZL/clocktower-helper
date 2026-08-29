import { useGameActions } from "../../contexts/GameActionsContext";
import { showConfirm } from "../../utils/nativeDialogShim";
import { ModalWrapper } from "./ModalWrapper";

export function MadnessCheckModal({ modal }: { modal: any }) {
  const props = useGameActions();
  if (!modal) return null;

  return (
    <ModalWrapper
      title="🧠 疯狂判定"
      onClose={() => props.setCurrentModal(null)}
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
      footer={
        <div className="flex flex-col sm:flex-row gap-3 w-full justify-center max-w-xl mx-auto">
          <button
            onClick={() => {
              props.setCurrentModal(null);
            }}
            className="flex-1 py-3 sm:py-4 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-white transition text-base sm:text-lg shadow-md"
          >
            取消
          </button>
          <button
            onClick={() => {
              props.addLog(
                `${modal.targetId + 1}号 疯狂判定：通过（正确扮演 ${modal.roleName}）`
              );
              props.setCurrentModal(null);
            }}
            className="flex-1 py-3 sm:py-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-black text-white transition text-base sm:text-lg shadow-md shadow-emerald-600/40 ring-2 ring-emerald-400 active:scale-[0.98]"
          >
            判定通过
          </button>
          <button
            onClick={() => {
              props.addLog(
                `${modal.targetId + 1}号 疯狂判定：失败（未正确扮演 ${modal.roleName}）`
              );
              const target = props.seats.find(
                (s: any) => s.id === modal.targetId
              );
              if (target && !target.isDead) {
                // 如果判定失败，说书人可以决定是否处决
                showConfirm({
                  title: "处决确认",
                  message: `是否处决 ${modal.targetId + 1}号？`,
                  onConfirm: () => {
                    props.saveHistory();
                    props.executePlayer(modal.targetId);
                    props.setCurrentModal(null);
                  },
                  onCancel: () => props.setCurrentModal(null),
                });
                return;
              }
              props.setCurrentModal(null);
            }}
            className="flex-1 py-3 sm:py-4 bg-red-600 hover:bg-red-500 rounded-xl font-black text-white transition text-base sm:text-lg shadow-md shadow-red-600/40 ring-2 ring-red-400 active:scale-[0.98]"
          >
            判定失败
          </button>
        </div>
      }
    >
      <div className="flex flex-col flex-1 p-2 sm:p-6 space-y-4 text-center my-auto w-full">
        <p className="text-xl sm:text-2xl md:text-3xl font-black text-white leading-relaxed">
          判定{" "}
          <span className="text-amber-400 font-black">
            【{modal.targetId + 1}号】
          </span>{" "}
          玩家是否遵守疯狂规则：
        </p>
        <p className="text-base sm:text-xl md:text-2xl font-bold text-amber-300">
          该玩家需要扮演【{modal.roleName}】
        </p>
      </div>
    </ModalWrapper>
  );
}
