import { Role, Seat, Script } from '@/app/data';
import { ModalWrapper } from './ModalWrapper';

// 辅助函数：获取座位的角色ID（如果是酒鬼，返回伪装角色）
const getSeatRoleId = (seat?: Seat | null): string | null => {
  if (!seat) return null;
  const role = seat.role?.id === 'drunk' ? seat.charadeRole : seat.role;
  return role ? role.id : null;
};

interface RangerModalProps {
  isOpen: boolean;
  targetId: number;
  roleId: string | null;
  seats: Seat[];
  roles: Role[];
  selectedScript: Script | null;
  onRoleChange: (roleId: string | null) => void;
  onConfirm: () => void;
}

export function RangerModal({
  isOpen,
  targetId,
  roleId,
  seats,
  roles,
  selectedScript,
  onRoleChange,
  onConfirm
}: RangerModalProps) {
  if (!isOpen) return null;

  const usedRoleIds = new Set(seats.map(s => getSeatRoleId(s)).filter(Boolean) as string[]);
  const townsfolk = roles
    .filter(r => r.type === 'townsfolk')
    .filter(r => {
      if (!selectedScript) return true;
      return (
        r.script === selectedScript.name ||
        (selectedScript.id === 'trouble_brewing' && !r.script) ||
        (selectedScript.id === 'bad_moon_rising' && (!r.script || r.script === '暗月初升')) ||
        (selectedScript.id === 'sects_and_violets' && (!r.script || r.script === '梦陨春宵')) ||
        (selectedScript.id === 'midnight_revelry' && (!r.script || r.script === '夜半狂欢'))
      );
    });

  return (
    <ModalWrapper
      title="巡山人：为落难少女选择新镇民"
      onClose={() => {}} // 不允许点击遮罩关闭
      closeOnOverlayClick={false}
      footer={
        <button className="px-4 py-2 bg-green-600 rounded font-bold hover:bg-green-700 transition-colors" onClick={onConfirm}>
          确定
        </button>
      }
      className="max-w-xl border-green-500"
    >
      <div className="text-gray-200 mb-4">
        目标：{targetId+1}号(落难少女) — 必须为其选择当前剧本的镇民角色（已在场镇民不可选，不可取消）
      </div>
      <select
        className="w-full bg-gray-900 border border-gray-600 rounded p-2"
        value={roleId ?? ''}
        onChange={e => onRoleChange(e.target.value || null)}
      >
        <option value="">选择不在场的镇民角色</option>
        {townsfolk.map(r => {
          const disabled = usedRoleIds.has(r.id);
          return (
            <option
              key={r.id}
              value={r.id}
              disabled={disabled}
              className={disabled ? 'text-gray-400' : ''}
            >
              {r.name}{disabled ? '（已在场）' : ''}
            </option>
          );
        })}
      </select>
    </ModalWrapper>
  );
}

