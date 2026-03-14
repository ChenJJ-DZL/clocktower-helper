import { useMemo, useState } from "react";
import type { Role, Seat } from "../../../app/data";
import { ModalWrapper } from "./ModalWrapper";

interface CourtierSelectRoleModalProps {
  isOpen: boolean;
  sourceId: number;
  roles: Role[];
  seats: Seat[];
  onConfirm: (roleId: string) => void;
  onCancel: () => void;
}

export function CourtierSelectRoleModal({
  isOpen,
  sourceId,
  roles,
  seats,
  onConfirm,
  onCancel,
}: CourtierSelectRoleModalProps) {
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");

  const presentRoleIds = useMemo(() => {
    const ids = new Set<string>();
    seats.forEach((s) => {
      if (!s.role) return;
      // 对酒鬼：其真实身份是 drunk，但“在场的角色”更贴近显示身份（charadeRole）
      if (s.role.id === "drunk" && s.charadeRole?.id) {
        ids.add(s.charadeRole.id);
        return;
      }
      ids.add(s.role.id);
    });
    return ids;
  }, [seats]);

  const { presentRoles, absentRoles } = useMemo(() => {
    const present: Role[] = [];
    const absent: Role[] = [];
    roles.forEach((r) => {
      (presentRoleIds.has(r.id) ? present : absent).push(r);
    });
    return { presentRoles: present, absentRoles: absent };
  }, [roles, presentRoleIds]);

  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="👑 侍臣：选择要致醉的角色"
      onClose={onCancel}
      className="max-w-xl border-purple-500"
      footer={
        <>
          <button
            className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className="px-4 py-2 bg-purple-600 rounded hover:bg-purple-700 transition-colors disabled:opacity-50"
            onClick={() => onConfirm(selectedRoleId)}
            disabled={!selectedRoleId}
            type="button"
          >
            确认并继续
          </button>
        </>
      }
    >
      <div className="text-gray-200 mb-2">来源：{sourceId + 1}号（侍臣）</div>
      <div className="text-xs text-purple-200/90 mb-4">
        说明：侍臣选择一个角色；若该角色在场，则其中一名该角色玩家从当晚开始醉酒
        3 天 3 夜。
      </div>

      <select
        className="w-full bg-gray-900 border border-gray-600 rounded p-2 mb-4"
        value={selectedRoleId}
        onChange={(e) => setSelectedRoleId(e.target.value)}
      >
        <option value="">请选择角色</option>
        <optgroup label="本局在场角色">
          {presentRoles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.type})
            </option>
          ))}
        </optgroup>
        <optgroup label="不在场角色（选择也会消耗侍臣能力）">
          {absentRoles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.type})
            </option>
          ))}
        </optgroup>
      </select>

      <div className="text-xs text-gray-400">
        提示：选择“不在场角色”同样会消耗侍臣能力（规则对齐），但不会让任何人醉酒。
      </div>
    </ModalWrapper>
  );
}
