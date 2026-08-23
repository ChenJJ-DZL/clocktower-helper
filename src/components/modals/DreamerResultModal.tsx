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
    <ModalWrapper title="筑梦师 - 结果" onClose={onClose}>
      <div className="p-6 text-white">
        <div className="text-center mb-6 space-y-3">
          <div className="text-xl md:text-2xl text-amber-200/90 font-medium leading-relaxed">
            筑梦师得知目标玩家的角色是以下之一：
          </div>
          <div className="text-3xl md:text-4xl font-black text-amber-400 tracking-wide text-center drop-shadow-md">
            【{roleA.name}】 或 【{roleB.name}】
          </div>
          <p className="text-base text-gray-400 mt-2">
            请说书人向玩家告知以上信息
          </p>
        </div>
        <div className="flex justify-center mt-6">
          <button
            onClick={onClose}
            className="px-8 py-3 font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-500 transition shadow-md"
          >
            确认并继续
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
