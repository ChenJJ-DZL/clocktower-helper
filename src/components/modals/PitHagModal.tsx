import { Role, Seat } from '@/app/data';
import { ModalWrapper } from './ModalWrapper';

// 辅助函数：获取座位的角色ID（如果是酒鬼，返回伪装角色）
const getSeatRoleId = (seat?: Seat | null): string | null => {
  if (!seat) return null;
  const role = seat.role?.id === 'drunk' ? seat.charadeRole : seat.role;
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
  onContinue
}: PitHagModalProps) {
  if (!isOpen) return null;

  const usedRoleIds = new Set(
    seats.map(s => getSeatRoleId(s)).filter(Boolean) as string[]
  );
  const availableRoles = roles.filter(r => !usedRoleIds.has(r.id));

  return (
    <ModalWrapper
      title="麻脸巫婆：变更角色"
      onClose={onCancel}
      footer={
        <>
          <button className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors" onClick={onCancel}>取消</button>
          <button className="px-4 py-2 bg-green-600 rounded hover:bg-green-700 transition-colors" onClick={onContinue}>已选择，继续</button>
        </>
      }
      className="max-w-xl border-purple-500"
    >
      <div className="text-gray-200 mb-2">
        目标：{targetId !== null ? `${targetId+1}号` : '未选择'}
      </div>
      <div className="text-xs text-purple-300 mb-4">
        麻脸巫婆只能将玩家变成本局尚未登场的角色。已在场的角色不会出现在列表中。
      </div>
      <select
        className="w-full bg-gray-900 border border-gray-600 rounded p-2 mb-4"
        value={roleId || ''}
        onChange={(e) => onRoleChange(e.target.value)}
      >
        <option value="">选择新角色</option>
        {availableRoles.map(r => (
          <option key={r.id} value={r.id}>{r.name} ({r.type})</option>
        ))}
      </select>
      <div className="text-xs text-gray-400">选择角色后，点击右下角"确认/下一步"完成本次行动。</div>
    </ModalWrapper>
  );
}

