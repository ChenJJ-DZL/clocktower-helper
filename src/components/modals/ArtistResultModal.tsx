import { useState } from "react";
import { ModalWrapper } from "./ModalWrapper";

interface ArtistResultModalProps {
  onClose: (result?: string) => void;
}

export function ArtistResultModal({ onClose }: ArtistResultModalProps) {
  const [question, setQuestion] = useState("");

  return (
    <ModalWrapper title="艺术家提问" onClose={() => onClose()}>
      <div className="p-4 text-white min-w-[300px]">
        <p className="mb-4 text-gray-300">
          艺术家发动了技能。说书人需要根据提问回答“是”、“否”或“不知道”。
        </p>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold">提问：</label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full p-2 text-white bg-gray-800 border border-gray-700 rounded focus:border-blue-500 focus:outline-none"
              placeholder="在此记录提问内容..."
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-center">
              选择你的回答:
            </label>
            <div className="flex justify-between gap-2">
              {["是", "否", "不知道"].map((v) => (
                <button
                  key={v}
                  onClick={() =>
                    onClose(
                      `结果: ${v}${question ? ` (提问: ${question})` : ""}`
                    )
                  }
                  className="flex-1 px-4 py-2 font-bold text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => onClose()}
            className="mt-2 text-sm text-gray-400 hover:text-white"
          >
            仅关闭弹窗
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
