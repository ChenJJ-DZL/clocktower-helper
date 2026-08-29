import type { Role } from "../../../app/data";
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
      <div className="p-2 sm:p-6 text-white flex flex-col flex-1 my-auto w-full">
        <div className="text-center my-auto space-y-4">
          <div className="text-lg sm:text-xl md:text-2xl text-amber-200/90 font-bold leading-relaxed">
            筑梦师得知目标玩家的角色是以下之一：
          </div>
          <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-amber-400 tracking-wider text-center drop-shadow-2xl my-4">
            【{roleA.name}】 或 【{roleB.name}】
          </div>
          <p className="text-sm sm:text-base md:text-lg text-gray-300 font-medium mt-2">
            请说书人向玩家告知以上信息
          </p>
        </div>
      </div>
    </ModalWrapper>
  );
}
