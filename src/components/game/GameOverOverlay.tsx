import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useGameActions } from "../../contexts/GameActionsContext";

export function GameOverOverlay() {
  const props = useGameActions();
  const [exporting, setExporting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const { exportReviewAsImage } = await import("../../utils/exportReview");
      // 捕获复盘弹窗内容（先打开复盘弹窗再导出）
      props.setCurrentModal({ type: "REVIEW", data: null });
      // 等待弹窗渲染
      await new Promise((r) => setTimeout(r, 500));
      const el = document.querySelector('[role="dialog"]') as HTMLElement;
      if (el) {
        await exportReviewAsImage({
          targetElement: el,
          scriptName: props.selectedScript?.name || "对局复盘",
          winResult: props.winResult,
          scale: window.devicePixelRatio > 1 ? 2 : 1,
        });
      }
    } catch (e) {
      console.error("导出失败:", e);
    } finally {
      setExporting(false);
    }
  }, [props]);

  if (props.gamePhase !== "gameOver" || typeof document === "undefined" || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="text-center">
        <h1
          className={`text-8xl font-bold mb-10 ${
            props.winResult?.toLowerCase() === "good"
              ? "text-blue-500"
              : "text-red-500"
          }`}
        >
          {props.winResult?.toLowerCase() === "good"
            ? "🏆 善良阵营胜利"
            : "👿 邪恶阵营获胜"}
        </h1>
        {props.winReason && (
          <p className="text-xl text-gray-400 mb-8">
            胜利依据：{props.winReason}
          </p>
        )}
        {props.winReason?.includes("猎手") && (
          <p className="text-sm text-gray-500 mb-8">
            按照规则，游戏立即结束，不再进行今天的处决和后续夜晚。
          </p>
        )}
        <div className="flex gap-6 justify-center">
          <button
            onClick={props.handleNewGame}
            className="px-10 py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-3xl font-bold transition-colors"
          >
            再来一局
          </button>
          <button
            onClick={() =>
              props.setCurrentModal({ type: "REVIEW", data: null })
            }
            className="px-10 py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-3xl font-bold transition-colors"
          >
            本局复盘
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-10 py-5 bg-amber-600 hover:bg-amber-700 text-white rounded-full text-3xl font-bold transition-colors disabled:opacity-50"
          >
            {exporting ? "⏳ 导出中..." : "📸 导出长图"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
