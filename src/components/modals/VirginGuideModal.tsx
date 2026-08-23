import { useGameActions } from "../../contexts/GameActionsContext";
import { ModalWrapper } from "./ModalWrapper";

export function VirginGuideModal() {
  const props = useGameActions();
  if (!props.virginGuideInfo) return null;
  const target = props.seats.find(
    (s: any) => s.id === props.virginGuideInfo?.targetId
  );
  const nominator = props.seats.find(
    (s: any) => s.id === props.virginGuideInfo?.nominatorId
  );
  if (!target) return null;
  const isFirst = props.virginGuideInfo.isFirstTime;
  const nomIsTown = props.virginGuideInfo.nominatorIsTownsfolk;

  return (
    <ModalWrapper
      title="🌸 贞洁者判定向导"
      onClose={() => props.setVirginGuideInfo(null)}
      className="max-w-xl"
      footer={
        <div className="flex gap-3 justify-end w-full">
          <button
            className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-medium text-white transition"
            onClick={() => props.setVirginGuideInfo(null)}
          >
            取消
          </button>
          <button
            className="px-6 py-2.5 bg-pink-600 hover:bg-pink-500 rounded-xl font-bold text-white transition"
            onClick={props.handleVirginGuideConfirm}
          >
            按此指引继续提名
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="text-xs text-slate-400">
          提名者：
          {nominator
            ? `${nominator.id + 1}号 ${nominator.role?.name || ""}`
            : "未知"}
          {" · "}
          目标：{target.id + 1}号 {target.role?.name || ""}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold text-white">
            这是本局贞洁者第几次被提名？
          </div>
          <div className="flex gap-3">
            <button
              className={`flex-1 py-2.5 rounded-xl font-bold transition text-sm ${isFirst ? "bg-pink-600 text-white" : "bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300"}`}
              onClick={() =>
                props.setVirginGuideInfo((prev: any) =>
                  prev ? { ...prev, isFirstTime: true } : null
                )
              }
            >
              第一次
            </button>
            <button
              className={`flex-1 py-2.5 rounded-xl font-bold transition text-sm ${!isFirst ? "bg-pink-600 text-white" : "bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300"}`}
              onClick={() =>
                props.setVirginGuideInfo((prev: any) =>
                  prev ? { ...prev, isFirstTime: false } : null
                )
              }
            >
              不是第一次
            </button>
          </div>
        </div>

        {isFirst && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-white">
              提名者是否是镇民？
            </div>
            <div className="flex gap-3">
              <button
                className={`flex-1 py-2.5 rounded-xl font-bold transition text-sm ${nomIsTown ? "bg-pink-600 text-white" : "bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300"}`}
                onClick={() =>
                  props.setVirginGuideInfo((prev: any) =>
                    prev ? { ...prev, nominatorIsTownsfolk: true } : null
                  )
                }
              >
                是镇民
              </button>
              <button
                className={`flex-1 py-2.5 rounded-xl font-bold transition text-sm ${!nomIsTown ? "bg-pink-600 text-white" : "bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300"}`}
                onClick={() =>
                  props.setVirginGuideInfo((prev: any) =>
                    prev ? { ...prev, nominatorIsTownsfolk: false } : null
                  )
                }
              >
                不是镇民
              </button>
            </div>
          </div>
        )}

        <div className="bg-slate-800/80 rounded-xl p-4 text-xs leading-5 text-slate-200 space-y-2 border border-white/5">
          {isFirst ? (
            nomIsTown ? (
              <>
                <div>• 这是贞洁者第一次被提名，且提名者是镇民。</div>
                <div>• 立刻处决提名者，而不是贞洁者。</div>
                <div>• 公告台词示例： "因为你提名了贞洁者，你被立即处决。"</div>
                <div>• 将贞洁者技能标记为已用，今后再被提名不再触发。</div>
                <div>
                  • 规则提示：这次“立刻处决”算作今日处决（影响涡流/送葬者等）。
                </div>
              </>
            ) : (
              <>
                <div>• 这是贞洁者第一次被提名，但提名者不是镇民。</div>
                <div>• 这次提名不产生额外处决。</div>
                <div>• 贞洁者技能视为已用完（即使这次没有处决任何人）。</div>
              </>
            )
          ) : (
            <>
              <div>• 贞洁者已经被提名过，能力已失效。</div>
              <div>• 这次提名按普通提名处理，不会再触发额外处决。</div>
            </>
          )}
        </div>
      </div>
    </ModalWrapper>
  );
}
