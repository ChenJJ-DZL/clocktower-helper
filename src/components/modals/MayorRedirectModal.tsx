import type { Seat } from "@/app/data";
import { ModalWrapper } from "./ModalWrapper";

interface MayorRedirectModalProps {
  isOpen: boolean;
  targetId: number;
  demonName: string;
  seats: Seat[];
  selectedTarget: number | null;
  onSelectTarget: (targetId: number) => void;
  onConfirmNoRedirect: () => void;
  onConfirmRedirect: (targetId: number) => void;
}

export function MayorRedirectModal({
  isOpen,
  targetId,
  demonName,
  seats,
  selectedTarget,
  onSelectTarget,
  onConfirmNoRedirect,
  onConfirmRedirect,
}: MayorRedirectModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="🏛️ 市长被攻击"
      onClose={() => {}} // 不允许点击遮罩关闭
      closeOnOverlayClick={false}
      footer={
        <div className="flex flex-wrap gap-4 justify-center w-full">
          <button
            onClick={onConfirmNoRedirect}
            className="px-8 py-4 bg-red-600 rounded-xl font-bold text-xl hover:bg-red-700 transition-colors"
          >
            不转移，让市长死亡
          </button>
          <button
            disabled={selectedTarget === null}
            onClick={() =>
              selectedTarget !== null && onConfirmRedirect(selectedTarget)
            }
            className={`px-8 py-4 rounded-xl font-bold text-xl transition-colors ${
              selectedTarget === null
                ? "bg-gray-600 text-gray-300 cursor-not-allowed"
                : "bg-yellow-500 text-black hover:bg-yellow-400"
            }`}
          >
            {selectedTarget !== null
              ? `转移给 ${selectedTarget + 1}号`
              : "请选择替死玩家"}
          </button>
        </div>
      }
      className="max-w-4xl"
    >
      <p className="text-xl text-white mb-2 text-center">
        恶魔（{demonName}）攻击了 {targetId + 1}号(市长)。
      </p>
      <p className="text-lg text-yellow-200 mb-4 text-center">
        是否要转移死亡目标？选择一名存活玩家代替死亡，或让市长死亡。
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[320px] overflow-y-auto">
        {seats
          .filter((s) => !s.isDead && s.id !== targetId)
          .map((seat) => (
            <button
              key={seat.id}
              onClick={() => onSelectTarget(seat.id)}
              className={`p-4 rounded-xl border-2 transition-colors text-left ${
                selectedTarget === seat.id
                  ? "border-yellow-400 bg-yellow-400/20"
                  : "border-gray-600 bg-gray-700/60"
              }`}
            >
              <div className="text-2xl font-bold text-white">
                {seat.id + 1}号
              </div>
              <div className="text-sm text-gray-200">
                {seat.role?.name || "未分配"}
              </div>
              {seat.isProtected && (
                <div className="text-xs text-green-300 mt-1">被保护</div>
              )}
            </button>
          ))}
      </div>
    </ModalWrapper>
  );
}
