import {
  type Role,
  roles,
  typeBgColors,
  typeColors,
  typeLabels,
} from "../../../app/data";
import { useGameActions } from "../../contexts/GameActionsContext";

export function RoleSelectModal({ modal }: { modal: any }) {
  const props = useGameActions();
  if (!modal) return null;

  return (
    <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-2xl text-center border-2 border-blue-500 max-w-4xl max-h-[80vh] overflow-y-auto">
        <h3 className="text-3xl font-bold mb-4">
          {modal.type === "philosopher" && "🎭 哲学家 - 选择善良角色"}
          {modal.type === "cerenovus" && "🧠 洗脑师 - 选择善良角色"}
          {modal.type === "pit_hag" && "🧙 麻脸巫婆 - 选择角色"}
        </h3>
        {modal.type === "pit_hag" && (
          <p className="text-sm text-gray-300 mb-3">
            当前剧本所有角色与座位号如下（仅供参考）：请先在主界面点选一名玩家作为目标，
            再在此选择一个<strong>当前场上尚未登场</strong>
            的角色身份，若合法则该玩家立刻变为该角色，并按夜晚顺位在本夜被叫醒。
          </p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
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
                  className={`p-4 rounded-xl border-2 ${typeColor} ${typeBgColor} transition-all text-left`}
                >
                  <div className="font-bold text-lg">{role.name}</div>
                  <div className="text-sm opacity-80 mt-1">
                    {typeLabels[role.type]}
                  </div>
                  <div className="text-xs opacity-60 mt-1 line-clamp-2">
                    {role.ability}
                  </div>
                </button>
              );
            })}
        </div>
        {modal.type === "pit_hag" && (
          <div className="mt-2 mb-4 text-left text-xs text-gray-300 max-h-40 overflow-y-auto border border-gray-700 rounded-xl p-3 bg-gray-900/60">
            <div className="font-bold mb-1">当前座位与角色一览：</div>
            {props.seats.map((s) => (
              <div key={s.id} className="flex justify-between">
                <span>[{s.id + 1}号]</span>
                <span className="ml-2 flex-1 text-right">
                  {props.getSeatRoleId(s)
                    ? roles.find((r) => r.id === props.getSeatRoleId(s))
                        ?.name || "未知角色"
                    : "空位 / 未分配"}
                </span>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => {
            props.setCurrentModal(null);
          }}
          className="w-full py-3 bg-gray-600 rounded-xl text-xl font-bold hover:bg-gray-500"
        >
          取消
        </button>
      </div>
    </div>
  );
}
