import { useGameActions } from "../../contexts/GameActionsContext";

export function DayActionModal({ modal }: { modal: any }) {
  const props = useGameActions();
  if (!modal) return null;

  return (
    <div className="fixed inset-0 z-[3000] bg-black/80 flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-2xl w-[500px] text-center">
        <h2 className="mb-6 text-3xl font-bold text-red-400">
          {modal.type === "slayer"
            ? "💥 开枪"
            : modal.type === "lunaticKill"
              ? "🔪 精神病患者日杀"
              : "🗣️ 提名"}
        </h2>
        <div className="flex flex-wrap gap-3 justify-center">
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
              // 8. 提名限制：检查是否已被提名或被提名过
              // 规则特例：玩家可以对自己发起提名（规则书中没有提及"不能对自己提名"）
              const isSelfNomination =
                modal.type === "nominate" && s.id === modal.sourceId;
              const isDisabled =
                modal.type === "nominate"
                  ? // 如果提名自己，检查自己是否已被提名过
                    isSelfNomination
                    ? props.nominationRecords.nominees.has(s.id) ||
                      props.nominationRecords.nominators.has(modal.sourceId)
                    : props.nominationRecords.nominees.has(s.id) ||
                      props.nominationRecords.nominators.has(modal.sourceId)
                  : modal.type === "lunaticKill"
                    ? s.id === modal.sourceId
                    : false;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    if (!isDisabled) {
                      if (
                        modal.type === "nominate" &&
                        s.role?.id === "virgin"
                      ) {
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
                  className={`p-4 border-2 rounded-xl text-xl font-bold transition-all ${
                    isDisabled
                      ? "opacity-30 cursor-not-allowed bg-gray-700"
                      : "hover:bg-gray-700"
                  }`}
                >
                  {s.id + 1}号 {s.role?.name}
                </button>
              );
            })}
        </div>
        <button
          onClick={() => {
            props.setCurrentModal(null);
          }}
          className="mt-8 w-full py-3 bg-gray-600 rounded-xl text-xl"
        >
          取消
        </button>
      </div>
    </div>
  );
}
