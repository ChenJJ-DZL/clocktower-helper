import { Role } from '@/app/data';
import { ModalWrapper } from './ModalWrapper';

interface RavenkeeperFakeModalProps {
  targetId: number | null;
  roles: Role[];
  onSelect: (role: Role) => void;
}

export function RavenkeeperFakeModal({ targetId, roles, onSelect }: RavenkeeperFakeModalProps) {
  if (targetId === null) return null;

  return (
    <ModalWrapper
      title="🧛 (中毒) 编造结果"
      onClose={() => {}} // 不允许点击遮罩关闭
      closeOnOverlayClick={false}
      className="max-w-2xl border-purple-500"
    >
      <div className="grid grid-cols-3 gap-3 max-h-[400px] overflow-y-auto">
        {roles.map(r=>(
          <button 
            key={r.id} 
            onClick={()=>onSelect(r)} 
            className="p-3 border rounded-lg text-sm font-medium hover:bg-purple-900 transition-colors"
          >
            {r.name}
          </button>
        ))}
      </div>
    </ModalWrapper>
  );
}

