import { useGameActions } from "../../contexts/GameActionsContext";
import { ModalWrapper } from "./ModalWrapper";

export function MadnessCheckModal({ modal }: { modal: any }) {
  const props = useGameActions();
  if (!modal) return null;

  const targetSeatNo = modal.targetId + 1;
  const roleName = modal.roleName;

  const markChecked = () => {
    if (props.setCerenovusTarget) {
      props.setCerenovusTarget((prev: any) =>
        prev
          ? { ...prev, checkedToday: true }
          : { targetId: modal.targetId, roleName: modal.roleName, checkedToday: true }
      );
    }
    if (props.dispatch) {
      props.dispatch({
        type: "UPDATE_STATE",
        updates: {
          cerenovusTarget: {
            targetId: modal.targetId,
            roleName: modal.roleName,
            checkedToday: true,
          },
        },
      });
    }
    props.setSeats?.((prev: any[]) =>
      prev.map((s) =>
        s.role?.id === "cerenovus" ||
        (modal.sourceSeatId != null && s.id === modal.sourceSeatId)
          ? { ...s, hasUsedDayAbility: true }
          : s
      )
    );
  };

  const handlePass = () => {
    props.addLog(
      `说书人判定 ${targetSeatNo}号 成功疯狂证明自己是【${roleName}】，无事发生。`
    );
    markChecked();
    props.setCurrentModal(null);
  };

  const handleFail = () => {
    props.addLog(
      `⚖️ 说书人判定 ${targetSeatNo}号 未能疯狂证明自己是【${roleName}】，立即被处决！跳过黄昏，直接进入下一个夜晚。`
    );
    markChecked();
    // 处决玩家并跳过黄昏直接进入下一个夜晚
    props.executePlayer(modal.targetId, { forceExecution: true });
    props.setCurrentModal(null);
    props.handleDayEndTransition({ forceNight: true });
  };

  return (
    <ModalWrapper
      title="🧠 疯狂洗脑判定"
      onClose={() => props.setCurrentModal(null)}
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
      footer={
        <div className="flex flex-col sm:flex-row gap-3 w-full justify-center max-w-xl mx-auto">
          <button
            onClick={() => {
              props.setCurrentModal(null);
            }}
            className="flex-1 py-3 sm:py-4 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-white transition text-base sm:text-lg shadow-md cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={handlePass}
            className="flex-1 py-3 sm:py-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-black text-white transition text-base sm:text-lg shadow-md shadow-emerald-600/40 ring-2 ring-emerald-400 active:scale-[0.98] cursor-pointer"
          >
            是 (通过 / 无事发生)
          </button>
          <button
            onClick={handleFail}
            className="flex-1 py-3 sm:py-4 bg-red-600 hover:bg-red-500 rounded-xl font-black text-white transition text-base sm:text-lg shadow-md shadow-red-600/40 ring-2 ring-red-400 active:scale-[0.98] cursor-pointer"
          >
            否 (处决并跳入下一夜)
          </button>
        </div>
      }
    >
      <div className="flex flex-col flex-1 p-2 sm:p-6 space-y-6 text-center my-auto w-full">
        <p className="text-xl sm:text-2xl md:text-3xl font-black text-white leading-relaxed">
          判定{" "}
          <span className="text-amber-400 font-black">
            【{targetSeatNo}号】
          </span>{" "}
          玩家是否真正“疯狂证明自己”：
        </p>
        <p className="text-base sm:text-xl md:text-2xl font-bold text-amber-300">
          要求扮演角色：【{roleName}】
        </p>
        <div className="text-sm sm:text-base text-slate-300 bg-slate-800/80 p-4 rounded-xl border border-white/10 max-w-md mx-auto space-y-2 text-left">
          <p>
            • <strong>选择“是”</strong>：玩家疯狂表现合格，无事发生，白天继续。
          </p>
          <p>
            • <strong>选择“否”</strong>：玩家未能疯狂扮演，<strong>立即被处决并跳过黄昏</strong>，直接进入下一个夜晚！
          </p>
        </div>
      </div>
    </ModalWrapper>
  );
}
