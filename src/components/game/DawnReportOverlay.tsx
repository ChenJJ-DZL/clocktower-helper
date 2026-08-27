import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useGameActions } from "../../contexts/GameActionsContext";

export function DawnReportOverlay() {
  const props = useGameActions();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (
    props.gamePhase !== "dawnReport" ||
    typeof document === "undefined" ||
    !mounted
  )
    return null;

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] bg-black/85 backdrop-blur-md flex items-center justify-center">
      <div className="bg-slate-900/95 p-10 rounded-3xl text-center border-2 border-yellow-500/80 shadow-2xl min-w-[420px] max-w-lg mx-4">
        <h2 className="text-5xl mb-6 font-bold text-amber-300">🌅 天亮了！</h2>
        <p className="text-2xl text-slate-200 mb-8">
          昨晚死亡：{" "}
          <span className="text-red-400 font-bold">
            {props.deadThisNight.length > 0
              ? props.deadThisNight.map((id) => `${id + 1}号`).join("、")
              : "平安夜"}
          </span>
        </p>
        <button
          onClick={() => props.setGamePhase("day")}
          className="px-10 py-4 bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-bold rounded-2xl text-2xl shadow-lg transition"
        >
          开始白天
        </button>
      </div>
    </div>,
    document.body
  );
}
