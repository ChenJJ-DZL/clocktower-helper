import { ModalWrapper } from './ModalWrapper';

interface VirginTriggerModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function VirginTriggerModal({ isOpen, onConfirm, onCancel }: VirginTriggerModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="✨ 贞洁者触发！"
      onClose={onCancel}
      footer={
        <>
          <button 
            onClick={onCancel} 
            className="px-6 py-4 bg-gray-600 rounded-xl text-xl hover:bg-gray-700 transition-colors"
          >
            取消
          </button>
          <button 
            onClick={onConfirm} 
            className="px-6 py-4 bg-red-600 rounded-xl text-xl font-bold hover:bg-red-700 transition-colors"
          >
            处决提名者
          </button>
        </>
      }
      className="max-w-md bg-indigo-900 border-white"
    >
      <p className="text-lg text-white text-center">贞洁者被提名，是否处决提名者？</p>
    </ModalWrapper>
  );
}

