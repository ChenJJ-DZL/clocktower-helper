import { useState } from "react";
import { ModalWrapper } from "./ModalWrapper";

interface ArtistResultModalProps {
  onClose: (result?: string) => void;
}

export function ArtistResultModal({ onClose }: ArtistResultModalProps) {
  const [question, setQuestion] = useState("");

  return (
    <ModalWrapper
      title="🎨 艺术家提问"
      onClose={() => onClose()}
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
    >
      <div className="p-2 sm:p-6 text-white max-w-full flex flex-col flex-1 space-y-4 my-auto w-full">
        <p className="text-sm sm:text-base md:text-lg text-gray-300 text-center leading-relaxed">
          艺术家发动了技能。说书人需要根据提问回答“是”、“否”或“不知道”。
        </p>

        <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="artist-question"
              className="text-sm sm:text-base font-bold text-amber-200"
            >
              提问内容：
            </label>
            <textarea
              id="artist-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full p-3 text-base sm:text-lg text-white bg-gray-800/90 border border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none shadow-inner"
              placeholder="在此记录提问内容..."
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-2.5 mt-1">
            <label
              htmlFor="artist-answer-options"
              className="text-sm sm:text-base font-bold text-center text-slate-200"
            >
              选择你的回答:
            </label>
            <div
              id="artist-answer-options"
              className="flex justify-between gap-3"
            >
              {["是", "否", "不知道"].map((v) => (
                <button
                  key={v}
                  onClick={() =>
                    onClose(
                      `结果: ${v}${question ? ` (提问: ${question})` : ""}`
                    )
                  }
                  className="flex-1 py-3.5 sm:py-4 px-2 font-black text-lg sm:text-xl md:text-2xl text-white bg-blue-600 rounded-xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/40 ring-2 ring-blue-400 active:scale-[0.98]"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-center pt-1">
            <button
              onClick={() => onClose()}
              className="py-2.5 px-6 text-sm sm:text-base text-gray-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition font-medium"
            >
              仅关闭弹窗
            </button>
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
}
