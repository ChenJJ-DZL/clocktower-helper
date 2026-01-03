import { ModalWrapper } from './ModalWrapper';

interface MayorThreeAliveModalProps {
  isOpen: boolean;
  onContinue: () => void;
  onDeclareWin: () => void;
  onCancel: () => void;
}

export function MayorThreeAliveModal({ isOpen, onContinue, onDeclareWin, onCancel }: MayorThreeAliveModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="⚠️ 市长 3 人存活提醒"
      onClose={onCancel}
      footer={
        <>
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <button
              onClick={onContinue}
              className="flex-1 py-3 bg-orange-600 rounded-xl font-bold hover:bg-orange-500 transition"
            >
              继续处决流程
            </button>
            <button
              onClick={onDeclareWin}
              className="flex-1 py-3 bg-green-600 rounded-xl font-bold hover:bg-green-500 transition"
            >
              宣告好人获胜
            </button>
          </div>
          <button
            onClick={onCancel}
            className="w-full py-2 bg-gray-700 rounded-xl font-bold hover:bg-gray-600 transition text-sm"
          >
            先留在白天
          </button>
        </>
      }
      className="max-w-xl"
    >
      <div className="space-y-3 text-gray-100 text-base leading-relaxed">
        <p>现在只剩 3 名玩家存活，且场上有【市长 (Mayor)】。</p>
        <p>若今天最终没有任何玩家被处决，好人 (Good) 将直接获胜。</p>
        <div className="text-sm text-gray-200 space-y-1">
          <p className="text-gray-300">你可以选择：</p>
          <ul className="list-disc list-inside space-y-1">
            <li>继续本日处决流程；</li>
            <li>或立即宣告好人获胜（若你已经决定今天不再处决任何人）。</li>
          </ul>
        </div>
      </div>
    </ModalWrapper>
  );
}

