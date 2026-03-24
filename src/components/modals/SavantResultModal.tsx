import { useState } from "react";
import { ModalWrapper } from "./ModalWrapper";

interface SavantResultModalProps {
  onClose: (infoA?: string, infoB?: string) => void;
}

export function SavantResultModal({ onClose }: SavantResultModalProps) {
  const [infoA, setInfoA] = useState("");
  const [infoB, setInfoB] = useState("");

  return (
    <ModalWrapper title="博学者信息" onClose={() => onClose()}>
      <div className="p-4 text-white min-w-[350px]">
        <p className="mb-4 text-gray-300">
          博学者发动了技能。说书人需要提供两条信息：一条为真，一条为假。
        </p>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="info-a" className="text-sm font-semibold">
              信息 A
            </label>
            <textarea
              id="info-a"
              value={infoA}
              onChange={(e) => setInfoA(e.target.value)}
              className="w-full p-2 text-white bg-gray-800 border border-gray-700 rounded focus:border-blue-500 focus:outline-none"
              placeholder="输入第一条信息..."
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="info-b" className="text-sm font-semibold">
              信息 B
            </label>
            <textarea
              id="info-b"
              value={infoB}
              onChange={(e) => setInfoB(e.target.value)}
              className="w-full p-2 text-white bg-gray-800 border border-gray-700 rounded focus:border-blue-500 focus:outline-none"
              placeholder="输入第二条信息..."
              rows={2}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onClose(infoA, infoB)}
              className="flex-1 px-4 py-2 font-bold text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
            >
              确认并记录
            </button>
            <button
              onClick={() => onClose()}
              className="px-4 py-2 font-bold text-gray-300 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
}
