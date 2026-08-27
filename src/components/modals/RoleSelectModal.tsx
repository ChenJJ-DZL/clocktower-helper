import {
  type Role,
  roles,
  typeBgColors,
  typeColors,
  typeLabels,
} from "../../../app/data";
import { useGameActions } from "../../contexts/GameActionsContext";
import { ModalWrapper } from "./ModalWrapper";

export function RoleSelectModal({ modal }: { modal: any }) {
  const props = useGameActions();
  if (!modal) return null;

  const title =
    modal.type === "philosopher"
      ? "🎭 哲学家 - 选择善良角色"
      : modal.type === "cerenovus"
        ? "🧠 洗脑师 - 选择善良角色"
        : "🧙 麻脸巫婆 - 选择角色";

  return (
    <ModalWrapper
      title={title}
      onClose={() => props.setCurrentModal(null)}
      className="max-w-4xl"
      footer={
        <button
          onClick={() => {
            props.setCurrentModal(null);
          }}
          className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-base font-bold text-white transition"
        >
          取消
        </button>
      }
    >
      <div className="space-y-4">
        {modal.type === "pit_hag" && (
          <p className="text-xs text-slate-300 bg-slate-800/80 p-3 rounded-xl border border-white/5 leading-relaxed">
            当前剧本所有角色与座位号如下（仅供参考）：请先在主界面点选一名玩家作为目标，
            再在此选择一个<strong>当前场上尚未登场</strong>
            的角色身份，若合法则该玩家立刻变为该角色，并按夜晚顺位在本夜被叫醒。
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[50vh] overflow-y-auto pr-1">
          {roles
            .filter((r: Role) => {
              if (modal.type === "philosopher" || modal.type === "cerenovus") {
                return r.type === "townsfolk" || r.type === "outsider";
              }
              // 麻脸巫婆：仅显示当前剧本的角色，方便查阅
              if (props.selectedScript) {
                return r.script === props.selectedScript.name;
              }
              return true;
            })
            .map((role: Role) => {
              const typeColor =
                typeColors[role.type] || "border-gray-500 text-gray-400";
              const typeBgColor =
                typeBgColors[role.type] || "bg-gray-900/50 hover:bg-gray-800";
              return (
                <button
                  key={role.id}
                  onClick={() => {
                    modal.onConfirm(role.id);
                  }}
                  className={`p-3 rounded-xl border-2 ${typeColor} ${typeBgColor} transition-all text-left flex flex-col justify-between`}
                >
                  <div>
                    <div className="font-bold text-base text-white">
                      {role.name}
                    </div>
                    <div className="text-xs opacity-80 mt-0.5">
                      {typeLabels[role.type]}
                    </div>
                  </div>
                  <div className="text-xs opacity-60 mt-1.5 line-clamp-2">
                    {role.ability}
                  </div>
                </button>
              );
            })}
        </div>
        {modal.type === "pit_hag" && (
          <div className="mt-2 text-left text-xs text-slate-300 max-h-32 overflow-y-auto border border-slate-700 rounded-xl p-3 bg-slate-900/60">
            <div className="font-bold mb-1 text-slate-200">
              当前座位与角色一览：
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {props.seats.map((s) => (
                <div key={s.id} className="flex justify-between">
                  <span>[{s.id + 1}号]</span>
                  <span className="ml-2 font-medium">
                    {props.getSeatRoleId(s)
                      ? roles.find((r) => r.id === props.getSeatRoleId(s))
                          ?.name || "未知角色"
                      : "空位 / 未分配"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalWrapper>
  );
}
