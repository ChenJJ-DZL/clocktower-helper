import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useGameState } from "../../hooks/useGameState";
import { useGameActions } from "../../contexts/GameActionsContext";

export function GameOverOverlay() {
  const gameState = useGameState();
  const actions = useGameActions();

  const {
    gamePhase,
    winResult,
    winReason,
    selectedScript,
    currentModal,
  } = gameState;

  const [exporting, setExporting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const prevGamePhaseRef = useRef(gamePhase);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 当游戏阶段新变为 gameOver 或显式打开 GAME_OVER 弹窗时，重置 dismissed
  useEffect(() => {
    if (currentModal?.type === "GAME_OVER") {
      setDismissed(false);
    }
    if (gamePhase === "gameOver" && prevGamePhaseRef.current !== "gameOver") {
      setDismissed(false);
    }
    prevGamePhaseRef.current = gamePhase;
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
    mounted &&
    typeof document !== "undefined" &&
    (currentModal?.type === "GAME_OVER" || (gamePhase === "gameOver" && !dismissed));

  if (!isVisible) return null;

  const isGood = winResult?.toLowerCase() === "good";
  const isEvil = winResult?.toLowerCase() === "evil";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[2147483647] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className={`relative w-full max-w-2xl bg-gradient-to-b ${
          isGood
            ? "from-slate-900 via-blue-950/90 to-slate-950 border-blue-500/50 shadow-[0_0_60px_rgba(59,130,246,0.45)]"
            : isEvil
              ? "from-slate-900 via-red-950/90 to-slate-950 border-red-500/50 shadow-[0_0_60px_rgba(239,68,68,0.45)]"
              : "from-slate-900 via-slate-900/95 to-slate-950 border-amber-500/40 shadow-[0_0_50px_rgba(245,158,11,0.3)]"
        } border-2 rounded-3xl p-8 sm:p-10 text-center text-white space-y-6`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer text-lg font-bold"
          title="关闭弹窗（可返回查看棋盘）"
        >
          ✕
        </button>

        {/* 顶部徽章 */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-xs sm:text-sm font-semibold tracking-wider uppercase">
          <span>👑</span>
          <span>游戏结算报告</span>
        </div>

        {/* 获胜主标题 */}
        <div className="space-y-2">
          <div className="text-5xl sm:text-6xl animate-bounce">
            {isGood ? "🏆" : isEvil ? "👿" : "🎭"}
          </div>
          <h1
            className={`text-3xl sm:text-5xl font-black tracking-tight ${
              isGood
                ? "text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-cyan-200 to-blue-400 drop-shadow-[0_0_20px_rgba(59,130,246,0.6)]"
                : isEvil
                  ? "text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-orange-300 to-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.6)]"
                  : "text-amber-300"
            }`}
          >
            {isGood
              ? "游戏结束 · 善良阵营获胜！"
              : isEvil
                ? "游戏结束 · 邪恶阵营获胜！"
                : "游戏结束"}
          </h1>
        </div>

        {/* 胜利依据卡片 */}
        <div className="p-4 sm:p-5 rounded-2xl bg-black/40 border border-white/10 space-y-2 text-left">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
            <span>⚖️</span>
            <span>胜利依据</span>
          </div>
          <p className="text-base sm:text-lg font-semibold text-slate-100 pl-6">
            {winReason || (isGood ? "所有恶魔已被消灭" : isEvil ? "邪恶阵营达成了胜利条件" : "对局已结束")}
          </p>
          {winReason?.includes("猎手") && (
            <p className="text-xs text-amber-300/90 pl-6">
              💡 猎手成功击杀恶魔，游戏立即结束并由善良阵营获胜。
            </p>
          )}
        </div>

        {/* 操作按钮组 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <button
            type="button"
            onClick={() => actions.setCurrentModal({ type: "REVIEW", data: null })}
            className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-base font-bold transition shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>📊</span>
            <span>本局复盘</span>
          </button>

          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="w-full py-3.5 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-base font-bold transition shadow-lg shadow-amber-600/30 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <span>{exporting ? "⏳" : "📸"}</span>
            <span>{exporting ? "导出中..." : "导出长图"}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleClose();
              actions.handleNewGame?.();
            }}
            className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-base font-bold transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>🔄</span>
            <span>再来一局</span>
          </button>
        </div>

        {/* 底部辅助查看棋盘按钮 */}
        <div className="pt-1">
          <button
            type="button"
            onClick={handleClose}
            className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
          >
            返回查看棋盘（随时可从右上角「复盘」或底部重新唤出）
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
