import { useState } from "react";
import { ModalWrapper } from "./ModalWrapper";

interface SavantResultModalProps {
  onClose: (infoA?: string, infoB?: string) => void;
}

export function SavantResultModal({ onClose }: SavantResultModalProps) {
  const [infoA, setInfoA] = useState("");
  const [infoB, setInfoB] = useState("");

  return (
    <ModalWrapper
      title="📜 博学者信息"
      onClose={() => onClose()}
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
      footer={
        <div className="flex gap-4 w-full justify-center">
          <button
            onClick={() => onClose()}
            className="flex-1 max-w-xs py-3 sm:py-4 font-bold text-gray-300 bg-slate-700 rounded-xl hover:bg-slate-600 transition text-base sm:text-lg shadow-md"
          >
            取消
          </button>
          <button
            onClick={() => onClose(infoA, infoB)}
            className="flex-1 max-w-xs py-3 sm:py-4 font-black text-white bg-blue-600 rounded-xl hover:bg-blue-500 transition shadow-lg shadow-blue-600/40 ring-2 ring-blue-400 active:scale-[0.98] text-base sm:text-lg"
          >
            确认并记录
          </button>
        </div>
      }
    >
      <div className="p-2 sm:p-6 text-white max-w-full flex flex-col flex-1 space-y-4 my-auto w-full">
        <p className="text-sm sm:text-base md:text-lg text-gray-300 text-center leading-relaxed">
          博学者发动了技能。说书人需要提供两条信息：一条为真，一条为假。
        </p>

        <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="info-a"
              className="text-sm sm:text-base font-bold text-amber-200"
            >
              信息 A：
            </label>
            <textarea
              id="info-a"
              value={infoA}
              onChange={(e) => setInfoA(e.target.value)}
              className="w-full p-3 text-base sm:text-lg text-white bg-gray-800/90 border border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none shadow-inner"
              placeholder="输入第一条信息..."
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="info-b"
              className="text-sm sm:text-base font-bold text-amber-200"
            >
              信息 B：
            </label>
            <textarea
              id="info-b"
              value={infoB}
              onChange={(e) => setInfoB(e.target.value)}
              className="w-full p-3 text-base sm:text-lg text-white bg-gray-800/90 border border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none shadow-inner"
              placeholder="输入第二条信息..."
              rows={2}
            />
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
}
