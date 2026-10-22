import { useGameActions } from "../../contexts/GameActionsContext";
import { ModalWrapper } from "./ModalWrapper";
import { resolveShamanConversion } from "../../utils/shamanRule";

export function ShamanConvertModal() {
  const props = useGameActions();
  if (props.currentModal?.type !== "SHAMAN_CONVERT") return null;

  return (
    <ModalWrapper
      title="🪬 灵言师：关键词被说出"
      onClose={() => {
        props.setCurrentModal(null);
        props.setShamanConvertTarget(null);
      }}
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
      footer={
        <div className="flex gap-4 justify-center w-full">
          <button
            className="flex-1 max-w-xs py-3 sm:py-4 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-bold text-base sm:text-lg transition shadow-md"
            onClick={() => {
              props.setCurrentModal(null);
              props.setShamanConvertTarget(null);
            }}
          >
            取消
          </button>
          <button
            className="flex-1 max-w-xs py-3 sm:py-4 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-black text-base sm:text-lg shadow-lg shadow-purple-600/40 ring-2 ring-purple-400 active:scale-[0.98] transition"
            onClick={() => {
              if (props.shamanConvertTarget === null) return;
              // 判据唯一事实源：utils/shamanRule（官方「第一个说出关键词的善良玩家变邪恶」）
              const resolution = resolveShamanConversion({
                seats: props.seats as any,
                targetId: props.shamanConvertTarget,
              });
              if (resolution.outcome === "converted" && resolution.patch) {
                props.setSeats((prev: any[]) =>
                  prev.map((s: any) =>
                    // 🔴 旧实现写的是 isEvil —— 全仓没人读（seatAlignment 只认
                    //    isEvilConverted）⇒ 日志写了、阵营没变。这里写权威字段。
                    s.id === props.shamanConvertTarget
                      ? { ...s, ...resolution.patch }
                      : s
                  )
                );
              }
              props.addLog(
                `灵言师触发：${props.shamanConvertTarget + 1}号 —— ${resolution.reason}`
              );
              props.setCurrentModal(null);
              props.setShamanConvertTarget(null);
            }}
          >
            确认转变
          </button>
        </div>
      }
    >
      <div className="space-y-4 p-2 sm:p-4 flex flex-col flex-1 w-full">
        <div className="text-slate-300 text-xs sm:text-sm leading-relaxed">
          {/* 官方（officialRoleDocs.json · 灵言师 · 角色简介）：「如果善良玩家说出了关键词，
              不论是**公开说出或是私下对说书人说出**，他就会在当晚转为邪恶阵营。」
              ⇒ 旧文案只写「公开说出」，漏掉了官方明确允许的「私下对说书人说出」。 */}
          请选择第一个说出关键词的玩家（公开说出，或私下对说书人说出）：若他是善良阵营（镇民/外来者），当晚起被视为邪恶；若本就是邪恶，则不产生额外效果。
        </div>
        <select
          className="w-full bg-slate-800 border border-slate-600 rounded-xl p-3 text-white text-base sm:text-lg font-bold focus:outline-none focus:border-purple-500"
          value={props.shamanConvertTarget ?? ""}
          onChange={(e) =>
            props.setShamanConvertTarget(
              e.target.value === "" ? null : Number(e.target.value)
            )
          }
        >
          <option value="">选择玩家</option>
          {props.seats
            .filter((s: any) => !s.isDead)
            .map((s: any) => (
              <option key={s.id} value={s.id}>
                [{s.id + 1}号] {s.role?.name}
              </option>
            ))}
        </select>
      </div>
    </ModalWrapper>
  );
}
