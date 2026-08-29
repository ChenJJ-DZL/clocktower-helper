import type { Role } from "@/app/data";
import { ModalWrapper } from "./ModalWrapper";

interface RavenkeeperFakeModalProps {
  targetId: number | null;
  roles: Role[];
  onSelect: (role: Role) => void;
}

export function RavenkeeperFakeModal({
  targetId,
  roles,
  onSelect,
}: RavenkeeperFakeModalProps) {
  if (targetId === null) return null;

  return (
    <ModalWrapper
      title="🧛 守鸦人 (中毒) 编造结果"
      onClose={() => {}} // 不允许点击遮罩关闭
      closeOnOverlayClick={false}
      size="fullscreen90"
      className="w-[90vw] h-[90vh] border-purple-500"
    >
      <div className="flex flex-col flex-1 p-2 sm:p-4 space-y-4 w-full">
        <p className="text-lg sm:text-xl text-amber-200 font-bold text-center">
          守鸦人当前中毒/醉酒，请选择一个伪造的角色告知守鸦人：
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5 sm:gap-3 p-1 w-full">
          {roles.map((r) => (
            <button
              key={r.id}
              onClick={() => onSelect(r)}
              className="py-3 sm:py-4 px-2 border-2 border-purple-400/80 rounded-xl text-base sm:text-lg font-black bg-slate-800/80 hover:bg-purple-900/60 hover:border-purple-300 transition-all flex flex-col items-center justify-center gap-0.5 shadow-sm text-white active:scale-95"
            >
              <span>{r.name}</span>
            </button>
          ))}
        </div>
      </div>
    </ModalWrapper>
  );
}
