import type { Role } from "../../../app/data";
import { AutoFitContent, SKILL_PAGE_AUTOFIT } from "../common/AutoFitContent";
import { ModalWrapper } from "./ModalWrapper";

interface DreamerResultModalProps {
  roleA: Role;
  roleB: Role;
  onClose: () => void;
}

export function DreamerResultModal({
  roleA,
  roleB,
  onClose,
}: DreamerResultModalProps) {
  return (
    <ModalWrapper
      title="💭 筑梦师 - 结果"
      onClose={onClose}
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
      footer={
        <div className="flex justify-center w-full">
          <button
            onClick={onClose}
            className="w-full max-w-sm py-3 sm:py-4 text-base sm:text-lg font-black text-white bg-blue-600 rounded-xl hover:bg-blue-500 transition shadow-lg shadow-blue-600/40 ring-2 ring-blue-400 active:scale-[0.98]"
          >
            确认并继续
          </button>
        </div>
      }
    >
      <AutoFitContent {...SKILL_PAGE_AUTOFIT} className="p-0 text-white">
        <div className="text-center my-auto space-y-3 max-w-full px-0 py-1">
          <div className="font-black text-amber-400 tracking-wide text-center drop-shadow-2xl break-words max-w-full mx-auto px-0 my-1 text-3xl sm:text-4xl md:text-5xl">
            【{roleA.name}】 或 【{roleB.name}】
          </div>
        </div>
      </AutoFitContent>
    </ModalWrapper>
  );
}
