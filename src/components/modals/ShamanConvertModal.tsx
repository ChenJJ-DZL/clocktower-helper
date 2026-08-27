import { useGameActions } from "../../contexts/GameActionsContext";
import { ModalWrapper } from "./ModalWrapper";

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
      className="max-w-xl"
      footer={
        <div className="flex gap-3 justify-end w-full">
          <button
            className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-medium transition"
            onClick={() => {
              props.setCurrentModal(null);
              props.setShamanConvertTarget(null);
            }}
          >
            取消
          </button>
          <button
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-bold transition"
            onClick={() => {
              if (props.shamanConvertTarget === null) return;
              const target = props.seats.find(
                (s: any) => s.id === props.shamanConvertTarget
              );
              if (!target) return;
              if (
                target.role &&
                ["townsfolk", "outsider"].includes(target.role.type)
              ) {
                props.setSeats((prev: any[]) =>
                  prev.map((s: any) =>
                    s.id === target.id
                      ? {
                          ...s,
                          isEvil: true,
                          reminderTokens: [
                            ...(s.reminderTokens || []),
                            {
                              id: `shaman_evil_${Date.now()}`,
                              name: "被视为邪恶(灵言师)",
                              type: "poison",
                              sourceRole: "shaman",
                            },
                          ],
                        }
                      : s
                  )
                );
                props.addLog(
                  `灵言师触发：${target.id + 1}号(${target.role.name})公开说出关键词，当晚起被视为邪恶阵营！`
                );
              } else {
                props.addLog(
                  `灵言师触发：${target.id + 1}号公开说出关键词，但其非善良身份，未发生阵营转变。`
                );
              }
              props.setCurrentModal(null);
              props.setShamanConvertTarget(null);
            }}
          >
            确认转变
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="text-slate-300 text-sm leading-relaxed">
          请选择第一个公开说出关键词的玩家：若他是善良阵营（镇民/外来者），当晚起被视为邪恶；若本就是邪恶，则不产生额外效果。
        </div>
        <select
          className="w-full bg-slate-800 border border-slate-600 rounded-xl p-3 text-white focus:outline-none focus:border-purple-500"
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
                [{s.id + 1}] {s.role?.name}
              </option>
            ))}
        </select>
      </div>
    </ModalWrapper>
  );
}
