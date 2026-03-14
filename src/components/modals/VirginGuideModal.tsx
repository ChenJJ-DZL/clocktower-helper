import { useGameActions } from "../../contexts/GameActionsContext";

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
    <div className="fixed inset-0 z-[3200] bg-black/80 flex items-center justify-center">
      <div className="bg-gray-900 p-8 rounded-2xl w-[620px] text-left space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-pink-200">贞洁者判定向导</h2>
          <span className="text-sm text-gray-400">
            提名者：
            {nominator
              ? `${nominator.id + 1}号 ${nominator.role?.name || ""}`
              : "未知"}
            {" · "}
            目标：{target.id + 1}号 {target.role?.name || ""}
          </span>
        </div>

        <div className="space-y-2">
          <div className="text-lg font-semibold text-white">
            这是本局贞洁者第几次被提名？
          </div>
          <div className="flex gap-3">
            <button
              className={`flex-1 py-3 rounded-xl font-bold transition ${isFirst ? "bg-pink-600 text-white" : "bg-gray-700 hover:bg-gray-600"}`}
              onClick={() =>
                props.setVirginGuideInfo((prev: any) =>
                  prev ? { ...prev, isFirstTime: true } : null
                )
              }
            >
              第一次
            </button>
            <button
              className={`flex-1 py-3 rounded-xl font-bold transition ${!isFirst ? "bg-pink-600 text-white" : "bg-gray-700 hover:bg-gray-600"}`}
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
            <div className="text-lg font-semibold text-white">
              提名者是镇民 (Townsfolk) 吗？
            </div>
            <div className="flex gap-3">
              <button
                className={`flex-1 py-3 rounded-xl font-bold transition ${nomIsTown ? "bg-emerald-600 text-white" : "bg-gray-700 hover:bg-gray-600"}`}
                onClick={() =>
                  props.setVirginGuideInfo((prev: any) =>
                    prev ? { ...prev, nominatorIsTownsfolk: true } : null
                  )
                }
              >
                是镇民
              </button>
              <button
                className={`flex-1 py-3 rounded-xl font-bold transition ${!nomIsTown ? "bg-amber-600 text-white" : "bg-gray-700 hover:bg-gray-600"}`}
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

        <div className="bg-gray-800/80 rounded-xl p-4 text-sm leading-6 text-gray-200 space-y-2">
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
                <div>
                  •
                  相克提示：若提名者同时被女巫诅咒，通常以“发起提名即因女巫死亡”为先；若你仍裁定提名成立，再处理贞洁者（请以说书人裁定为准）。
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

        <div className="flex gap-3">
          <button
            className="flex-1 py-3 bg-pink-600 hover:bg-pink-500 rounded-xl font-bold text-white"
            onClick={props.handleVirginGuideConfirm}
          >
            按此指引继续提名
          </button>
          <button
            className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-bold text-white"
            onClick={() => props.setVirginGuideInfo(null)}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
