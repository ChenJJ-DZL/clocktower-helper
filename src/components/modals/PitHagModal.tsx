import type { Role, Seat } from "@/app/data";
import { ModalWrapper } from "./ModalWrapper";

// 辅助函数：获取座位的角色ID（如果是酒鬼，返回伪装角色）
const getSeatRoleId = (seat?: Seat | null): string | null => {
  if (!seat) return null;
  const role = seat.role?.id === "drunk" ? seat.charadeRole : seat.role;
  return role ? role.id : null;
};

interface PitHagModalProps {
  isOpen: boolean;
  targetId: number | null;
  roleId: string | null;
  seats: Seat[];
  roles: Role[];
  onRoleChange: (roleId: string) => void;
  onCancel: () => void;
  onContinue: () => void;
}

export function PitHagModal({
  isOpen,
  targetId,
  roleId,
  seats,
  roles,
  onRoleChange,
  onCancel,
  onContinue,
}: PitHagModalProps) {
  if (!isOpen) return null;

  const usedRoleIds = new Set(
    seats.map((s) => getSeatRoleId(s)).filter(Boolean) as string[]
  );
  const availableRoles = roles.filter((r) => !usedRoleIds.has(r.id));

  return (
    <ModalWrapper
      title="🧙‍♀️ 麻脸巫婆：变更角色"
      onClose={onCancel}
      size="fullscreen90"
      className="w-[90vw] h-[90vh] border-purple-500"
      footer={
        <div className="flex gap-4 w-full justify-center">
          <button
            className="flex-1 max-w-xs py-3 sm:py-4 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-base sm:text-lg text-white transition shadow-md"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="flex-1 max-w-xs py-3 sm:py-4 bg-purple-600 hover:bg-purple-500 rounded-xl font-black text-base sm:text-lg text-white transition shadow-lg shadow-purple-600/40 ring-2 ring-purple-400 active:scale-[0.98]"
            onClick={onContinue}
          >
            已选择，继续
          </button>
        </div>
      }
    >
      <div className="flex flex-col flex-1 p-2 sm:p-4 space-y-3 w-full">
        <div className="text-white font-bold text-base sm:text-lg">
          目标：{targetId !== null ? `${targetId + 1}号` : "未选择"}
        </div>
        <div className="text-xs sm:text-sm text-purple-300">
          麻脸巫婆只能将玩家变成本局尚未登场的角色。已在场的角色不会出现在列表中。
        </div>
        <select
          className="w-full bg-gray-900 border border-gray-600 rounded-xl p-3 text-white text-base sm:text-lg font-bold my-2"
          value={roleId || ""}
          onChange={(e) => onRoleChange(e.target.value)}
        >
          <option value="">选择新角色</option>
          {availableRoles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.type})
            </option>
          ))}
        </select>
        <div className="text-xs text-gray-400">
          选择角色后，点击“已选择，继续”完成本次行动。
        </div>
      </div>
    </ModalWrapper>
  );
}
