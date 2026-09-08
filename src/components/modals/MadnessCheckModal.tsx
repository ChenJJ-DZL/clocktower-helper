import { useGameActions } from "../../contexts/GameActionsContext";
import { AutoFitContent } from "../common/AutoFitContent";
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
      `⚖️ 说书人判定 ${targetSeatNo}号 未能疯狂证明自己是【${roleName}】，因违反疯狂规则被立即处决！跳过今日剩余阶段，进入下一个夜晚。`
    );
    markChecked();
    // 处决玩家
    props.executePlayer(modal.targetId, { forceExecution: true });
    // 弹出标准处决结果弹窗，向说书人明确展示处决结果，确认后跳入下一夜
    props.setCurrentModal({
      type: "EXECUTION_RESULT",
      data: {
        message: `⚖️ 说书人判定 ${targetSeatNo}号 未能疯狂证明自己是【${roleName}】，因违反疯狂规则被立即处决死亡！今日立即结束，确认后直接进入下一个夜晚。`,
        isInstantNight: true,
      },
    });
  };

  return (
    <ModalWrapper
      title="🧠 疯狂洗脑判定"
      onClose={() => props.setCurrentModal(null)}
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
      footer={
        <div className="flex flex-row gap-3 sm:gap-4 w-full justify-center max-w-2xl mx-auto">
          <button
            type="button"
            onClick={() => {
              props.setCurrentModal(null);
            }}
            className="flex-1 py-2.5 sm:py-3.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-white transition text-sm sm:text-base md:text-lg shadow-md cursor-pointer whitespace-nowrap"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handlePass}
            className="flex-1 py-2.5 sm:py-3.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-black text-white transition text-sm sm:text-base md:text-lg shadow-md shadow-emerald-600/40 ring-2 ring-emerald-400 active:scale-[0.98] cursor-pointer whitespace-nowrap"
          >
            是 (通过 / 无事发生)
          </button>
          <button
            type="button"
            onClick={handleFail}
            className="flex-1 py-2.5 sm:py-3.5 bg-red-600 hover:bg-red-500 rounded-xl font-black text-white transition text-sm sm:text-base md:text-lg shadow-md shadow-red-600/40 ring-2 ring-red-400 active:scale-[0.98] cursor-pointer whitespace-nowrap"
          >
            否 (处决并跳入下一夜)
          </button>
        </div>
      }
    >
      <AutoFitContent targetRatio={0.9} minScale={0.2} className="p-2 sm:p-4 text-white">
        <div className="flex flex-col items-center justify-center text-center space-y-6 sm:space-y-8 w-max max-w-none px-6 py-4 my-auto">
          <div className="text-5xl sm:text-6xl md:text-7xl drop-shadow-xl select-none">
            🧠
          </div>

          <div className="space-y-3 sm:space-y-4">
            <div className="text-3xl sm:text-4xl md:text-5xl font-black text-white leading-relaxed tracking-wide whitespace-nowrap drop-shadow-md">
              判定{" "}
              <span className="text-amber-400 font-black">
                【{targetSeatNo}号】
              </span>{" "}
              玩家是否真正“疯狂证明自己”：
            </div>

            <div className="text-2xl sm:text-3xl md:text-4xl font-black text-amber-300 whitespace-nowrap">
              要求扮演角色：
              <span className="text-emerald-300 font-black">
                【{roleName}】
              </span>
            </div>
          </div>

          <div className="text-base sm:text-lg md:text-xl text-slate-200 bg-slate-800/90 px-8 sm:px-10 py-5 sm:py-6 rounded-2xl border border-white/15 space-y-3 text-left shadow-2xl w-max max-w-none backdrop-blur-sm">
            <div className="whitespace-nowrap flex items-center gap-2">
              <span className="text-emerald-400 text-lg sm:text-xl font-black">•</span>
              <span>
                <strong className="text-emerald-400 font-black">选择“是”</strong>
                ：玩家疯狂表现合格，无事发生，白天继续。
              </span>
            </div>
            <div className="whitespace-nowrap flex items-center gap-2">
              <span className="text-rose-400 text-lg sm:text-xl font-black">•</span>
              <span>
                <strong className="text-rose-400 font-black">选择“否”</strong>
                ：玩家未能疯狂扮演，
                <strong className="text-amber-300 font-black">
                  立即被处决并跳过黄昏
                </strong>
                ，直接进入下一个夜晚！
              </span>
            </div>
          </div>
        </div>
      </AutoFitContent>
    </ModalWrapper>
  );
}
