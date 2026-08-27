import { useCallback, useEffect, useState } from "react";
import { useGameActions } from "../../contexts/GameActionsContext";
import { useGameState } from "../../hooks/useGameState";
import { ModalWrapper } from "../modals/ModalWrapper";

export function GameOverOverlay() {
  const gameState = useGameState();
  const actions = useGameActions();

  const { gamePhase, winResult, winReason, selectedScript, currentModal } =
    gameState;

  const [exporting, setExporting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // 当游戏阶段新变为 gameOver 或显式打开 GAME_OVER 弹窗时，重置 dismissed
  useEffect(() => {
    if (currentModal?.type === "GAME_OVER") {
      setDismissed(false);
    }
    if (gamePhase !== "gameOver") {
      setDismissed(false);
    }
  }, [gamePhase, currentModal]);

  const handleClose = useCallback(() => {
    setDismissed(true);
    if (currentModal?.type === "GAME_OVER") {
      actions.setCurrentModal(null);
    }
  }, [currentModal, actions]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const { exportReviewAsImage } = await import("../../utils/exportReview");
      // 捕获复盘弹窗内容（先打开复盘弹窗再导出）
      actions.setCurrentModal({ type: "REVIEW", data: null });
      // 等待弹窗渲染
      await new Promise((r) => setTimeout(r, 500));
      const el = document.querySelector('[role="dialog"]') as HTMLElement;
      if (el) {
        await exportReviewAsImage({
          targetElement: el,
          scriptName: selectedScript?.name || "对局复盘",
          winResult: winResult,
          scale: window.devicePixelRatio > 1 ? 2 : 1,
        });
      }
    } catch (e) {
      console.error("导出失败:", e);
    } finally {
      setExporting(false);
    }
  }, [actions, selectedScript, winResult]);

  const isVisible =
    currentModal?.type === "GAME_OVER" ||
    (gamePhase === "gameOver" && !dismissed);

  if (!isVisible) return null;

  const isGood = winResult?.toLowerCase() === "good";
  const isEvil = winResult?.toLowerCase() === "evil";

  const winTitle = isGood
    ? "🏆 游戏结束 · 善良阵营获胜！"
    : isEvil
      ? "👿 游戏结束 · 邪恶阵营获胜！"
      : "👑 游戏结束";

  return (
    <ModalWrapper
      title={winTitle}
      onClose={handleClose}
      className="max-w-2xl"
      footer={
        <div className="flex flex-col sm:flex-row gap-3 w-full justify-between items-center">
          <button
            type="button"
            onClick={handleClose}
            className="w-full sm:w-auto px-4 py-3 rounded-xl border border-white/20 text-slate-300 hover:text-white hover:bg-white/10 text-sm font-semibold transition cursor-pointer"
          >
            返回查看棋盘
          </button>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="px-5 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm transition shadow-lg shadow-amber-600/30 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <span>{exporting ? "⏳" : "📸"}</span>
              <span>{exporting ? "导出中..." : "导出长图"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                actions.setCurrentModal({ type: "REVIEW", data: null });
              }}
              className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>📊</span>
              <span>本局复盘</span>
            </button>
            <button
              type="button"
              onClick={() => {
                handleClose();
                if (actions.handleNewGame) {
                  actions.handleNewGame();
                } else if (actions.handleRestart) {
                  actions.handleRestart();
                }
              }}
              className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base transition shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>🔄</span>
              <span>再来一局</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-6 py-2 text-center">
        {/* 获胜主徽章与图标 */}
        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="text-6xl animate-bounce">
            {isGood ? "🏆" : isEvil ? "👿" : "👑"}
          </div>
          <div
            className={`text-2xl sm:text-3xl font-black ${
              isGood
                ? "text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.6)]"
                : isEvil
                  ? "text-red-400 drop-shadow-[0_0_15px_rgba(239,68,68,0.6)]"
                  : "text-amber-300"
            }`}
          >
            {isGood
              ? "善良阵营取得最终胜利！"
              : isEvil
                ? "邪恶阵营取得最终胜利！"
                : "本局游戏已结束"}
          </div>
        </div>

        {/* 胜利依据卡片 */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-800/80 border border-white/10 space-y-2 text-left">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
            <span>⚖️</span>
            <span>胜利依据</span>
          </div>
          <p className="text-base sm:text-lg font-semibold text-slate-100 pl-6">
            {winReason ||
              (isGood
                ? "所有恶魔已被消灭"
                : isEvil
                  ? "邪恶阵营达成了胜利条件"
                  : "对局已结束")}
          </p>
          {winReason?.includes("猎手") && (
            <p className="text-xs text-amber-300/90 pl-6">
              💡 猎手成功击杀恶魔，游戏立即结束并由善良阵营获胜。
            </p>
          )}
        </div>
      </div>
    </ModalWrapper>
  );
}
