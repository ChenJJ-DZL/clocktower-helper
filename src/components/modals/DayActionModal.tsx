import { useGameActions } from "../../contexts/GameActionsContext";
import {
  canBeNominated,
  canNominate,
} from "../../utils/nominationEligibility";
import { displayPlayerName } from "../../utils/seatLabel";
import { ModalWrapper } from "./ModalWrapper";

export function DayActionModal({ modal }: { modal: any }) {
  const props = useGameActions();
  if (!modal) return null;

  const title =
    modal.type === "slayer"
      ? "💥 杀手开枪"
      : modal.type === "lunaticKill"
        ? "🔪 精神病患者日杀"
        : "🗣️ 发起提名";

  return (
    <ModalWrapper
      title={title}
      onClose={() => props.setCurrentModal(null)}
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
      footer={
        <div className="flex justify-center w-full">
          <button
            onClick={() => props.setCurrentModal(null)}
            className="w-full max-w-sm py-3 sm:py-4 bg-slate-700 hover:bg-slate-600 rounded-xl text-base sm:text-lg font-bold text-white transition shadow-md"
          >
            取消
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-6 gap-3.5 p-1 w-full">
        {props.seats
          .filter((s) => {
            // 暗月初升剧本：存活玩家可以提名死人
            // 其他剧本：只能提名存活玩家
            if (
              modal.type === "nominate" &&
              props.selectedScript?.id === "bad_moon_rising"
            ) {
              // 暗月初升：可以提名死人（包括僵怖假死状态）
              return s.role !== null;
            }
            // 其他情况：只能提名存活玩家
            return !s.isDead;
          })
          .map((s) => {
            // 🗣️ 提名限制：本黄昏该提名者是否已发起过提名 / 该座位是否已被提名过。
            //    判定统一走 utils/nominationEligibility（唯一事实来源），
            //    与 executeNomination 的执行层守卫保持完全一致。
            const isDisabled =
              modal.type === "nominate"
                ? !canNominate(props.nominationRecords ?? null, modal.sourceId)
                    .ok ||
                  !canBeNominated(props.nominationRecords ?? null, s.id).ok
                : modal.type === "lunaticKill"
                  ? s.id === modal.sourceId
                  : false;
            return (
              <button
                key={s.id}
                onClick={() => {
                  if (!isDisabled) {
                    if (modal.type === "nominate" && s.role?.id === "virgin") {
                      const nominatorSeat = props.seats.find(
                        (seat: any) => seat.id === modal.sourceId
                      );
                      const isRealTownsfolk = !!(
                        nominatorSeat &&
                        nominatorSeat.role?.type === "townsfolk" &&
                        nominatorSeat.role?.id !== "drunk" &&
                        !nominatorSeat.isDrunk
                      );
                      props.setVirginGuideInfo({
                        targetId: s.id,
                        nominatorId: modal.sourceId ?? 0,
                        isFirstTime: !s.hasBeenNominated,
                        nominatorIsTownsfolk: isRealTownsfolk,
                      });
                      // Trigger VFX on Virgin
                      props.setVfxTrigger({ seatId: s.id, type: "virgin" });
                      setTimeout(() => props.setVfxTrigger(null), 1000);

                      props.setCurrentModal(null);
                      return;
                    }
                    props.handleDayAction(s.id);
                    props.setCurrentModal(null);
                  }
                }}
                disabled={isDisabled}
                className={`py-3 sm:py-4 px-3 border-2 rounded-xl text-base sm:text-lg font-black transition-all flex flex-col items-center justify-center gap-1 shadow-sm ${
                  isDisabled
                    ? "opacity-30 cursor-not-allowed bg-slate-900/50 border-slate-800 text-slate-500"
                    : "bg-slate-800/90 hover:bg-slate-700 hover:border-slate-500 border-slate-600 text-white active:scale-95"
                }`}
              >
                <span className="text-amber-400 font-bold">{s.id + 1}号</span>
                <span className="truncate">{s.role?.name}</span>
                {displayPlayerName(s.playerName, s.id) && (
                  <span className="text-[10px] sm:text-xs text-slate-400 font-normal truncate">
                    ({displayPlayerName(s.playerName, s.id)})
                  </span>
                )}
              </button>
            );
          })}
      </div>
    </ModalWrapper>
  );
}
