import { ModalWrapper } from './ModalWrapper';

interface PacifistConfirmModalProps {
  isOpen: boolean;
  targetId: number;
  onSave: () => void;
  onDoNotSave: () => void;
}

export function PacifistConfirmModal({ isOpen, targetId, onSave, onDoNotSave }: PacifistConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="🕊️ 和平主义者"
      onClose={onDoNotSave}
      closeOnOverlayClick={false}
      footer={
        <div className="flex gap-4">
          <button
            onClick={onSave}
            className="px-10 py-4 bg-green-600 rounded-xl font-bold text-xl hover:bg-green-700 transition-colors"
          >
            本次处决不死
          </button>
          <button
            onClick={onDoNotSave}
            className="px-10 py-4 bg-gray-600 rounded-xl font-bold text-xl hover:bg-gray-700 transition-colors"
          >
            正常处决
          </button>
        </div>
      }
      className="max-w-xl"
    >
      <div className="space-y-3 text-white">
        <p className="text-xl font-bold text-center">
          {targetId + 1}号 镇民被处决：是否触发【和平主义者】使其不死亡？
        </p>
        <p className="text-sm text-gray-300 text-center">
          规则：和平主义者让“被处决的镇民可能不会死亡”，由说书人裁定（通常随机）。
        </p>
      </div>
    </ModalWrapper>
  );
}


