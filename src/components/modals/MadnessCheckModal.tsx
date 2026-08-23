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
      className="max-w-md"
      footer={
        <div className="flex gap-3 w-full justify-end">
          <button
            onClick={() => {
              props.setCurrentModal(null);
            }}
            className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-medium text-white transition"
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
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-white transition"
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
            className="px-5 py-2.5 bg-red-600 hover:bg-red-500 rounded-xl font-bold text-white transition"
          >
            判定失败
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-left">
        <p className="text-base text-slate-200">目标玩家：<strong className="text-white">{modal.targetId + 1}号</strong></p>
        <p className="text-base text-purple-300">要求扮演角色：<strong>{modal.roleName}</strong></p>
        <p className="text-sm text-slate-400 leading-relaxed">
          该玩家需要在白天和夜晚“疯狂”地证明自己是这个角色，否则可能被说书人直接处决。
        </p>
      </div>
    </ModalWrapper>
  );
}
