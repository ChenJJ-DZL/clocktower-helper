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
        <div className="flex justify-center w-full">
          <button
            onClick={() => {
              props.setCurrentModal(null);
            }}
            className="w-full max-w-sm py-3.5 sm:py-4 bg-slate-700 hover:bg-slate-600 rounded-2xl text-base sm:text-lg font-bold text-white transition shadow-md cursor-pointer active:scale-95"
          >
            取消
          </button>
        </div>
      }
    >
      <div className="space-y-4 my-auto w-full">
        {modal.type === "pit_hag" && (
          <p className="text-sm sm:text-base text-slate-200 bg-slate-800/80 p-4 rounded-2xl border border-white/10 leading-relaxed font-medium">
            当前剧本所有角色与座位号如下（仅供参考）：请先在主界面点选一名玩家作为目标，
            再在此选择一个<strong>当前场上尚未登场</strong>
            的角色身份，若合法则该玩家立刻变为该角色，并按夜晚顺位在本夜被叫醒。
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 max-h-[60vh] overflow-y-auto pr-1">
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
                  className={`p-4 rounded-2xl border-2 ${typeColor} ${typeBgColor} transition-all text-left flex flex-col justify-between cursor-pointer hover:scale-[1.02] shadow-md`}
                >
                  <div>
                    <div className="font-black text-lg sm:text-xl text-white">
                      {role.name}
                    </div>
                    <div className="text-xs sm:text-sm opacity-90 mt-0.5 font-semibold">
                      {typeLabels[role.type]}
                    </div>
                  </div>
                  <div className="text-xs sm:text-sm opacity-80 mt-2 line-clamp-3 leading-relaxed">
                    {role.ability}
                  </div>
                </button>
              );
            })}
        </div>
        {modal.type === "pit_hag" && (
          <div className="mt-3 text-left text-sm text-slate-200 max-h-36 overflow-y-auto border border-slate-700 rounded-2xl p-4 bg-slate-900/80">
            <div className="font-black mb-1.5 text-amber-300 text-base">
              当前座位与角色一览：
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 font-medium">
              {props.seats.map((s) => (
                <div key={s.id} className="flex justify-between">
                  <span>[{s.id + 1}号]</span>
                  <span className="ml-2 font-bold text-white">
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
