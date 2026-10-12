"use client";

import type React from "react";
import { useCallback, useState } from "react";
import type { GamePhase, Role } from "../../../../app/data";
import { FABLED_ROLES, TRAVELER_ROLES } from "../../../../app/data";
import { gameActions, useGameContext } from "../../../contexts/GameContext";
import {
  canEditFabled,
  FABLED_MAX,
  setTravelerAt,
  TRAVELER_MAX,
  withFabled,
} from "../../../utils/fabledLock";
import { exileThreshold } from "../../../utils/exile";
import { ExileVoteModal } from "../../modals/ExileVoteModal";
import { ModalWrapper } from "../../modals/ModalWrapper";

interface TableCenterHUDProps {
  gamePhase: GamePhase;
  nightCount: number;
  timer: number;
  formatTimer: (seconds: number) => string;
  isTimerRunning: boolean;
  winResult?: "good" | "evil" | null;
  winReason?: string | null;
  onTimerStart?: () => void;
  onTimerPause?: () => void;
  onTimerReset?: () => void;
}

/**
 * TableCenterHUD - Dashboard component for the center of the round table
 * Displays phase indicator, interactive timer, and credits
 */
export function TableCenterHUD({
  gamePhase,
  nightCount,
  timer,
  formatTimer,
  isTimerRunning,
  winResult,
  winReason: _winReason,
  onTimerStart,
  onTimerPause,
  onTimerReset,
}: TableCenterHUDProps) {
  const handleTimerClick = useCallback(() => {
    if (isTimerRunning) {
      onTimerPause?.();
    } else {
      onTimerStart?.();
    }
  }, [isTimerRunning, onTimerPause, onTimerStart]);

  const handleTimerReset = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onTimerReset?.();
    },
    [onTimerReset]
  );

  // ===== 说书人（传奇角色）座位 + 旅行者座位行（不占玩家 15 座） =====
  const { state, dispatch } = useGameContext();
  const activeFabled = state.activeFabled ?? [];
  const travelers = state.travelers ?? [];
  const seats = state.seats ?? [];
  const exileProposedToday = state.exileProposedToday ?? null;
  const fabledEditable = canEditFabled(gamePhase);
  // 游戏中行为总闸：终局后一切流放/配置操作禁用
  const gameEnded = !!winResult;
  // 流放允许窗口：落座确认后（!fabledEditable）且未终局
  const exileAllowed = !fabledEditable && !gameEnded;
  // 全体玩家（含旅行者）——流放门槛口径（2026-10-12 交互审查修正）
  const totalPlayers =
    seats.length + travelers.filter(Boolean).length;
  const selectedFabled = activeFabled[0] ?? null;
  const travelerCount = travelers.filter(Boolean).length;
  const [showFabledPicker, setShowFabledPicker] = useState(false);
  const [showTravelerRow, setShowTravelerRow] = useState(false);
  // 旅行者弹窗按位置打开：null = 关闭，数字 = 正在为第 i 个座位选人
  const [travelerSeatIndex, setTravelerSeatIndex] = useState<number | null>(
    null
  );

  const handleFabledSeatClick = useCallback(() => {
    if (!canEditFabled(gamePhase)) return;
    setShowFabledPicker(true);
  }, [gamePhase]);

  const handlePickFabled = useCallback(
    (role: Role) => {
      dispatch(gameActions.setActiveFabled(withFabled(activeFabled, role)));
      setShowFabledPicker(false);
    },
    [dispatch, activeFabled]
  );

  const handleClearFabled = useCallback(() => {
    dispatch(gameActions.setActiveFabled([]));
    setShowFabledPicker(false);
  }, [dispatch]);

  // 为第 seatIndex 个旅行者座位指定/更换角色（位置化写入）
  const handlePickTraveler = useCallback(
    (role: Role) => {
      if (travelerSeatIndex === null) return;
      dispatch(
        gameActions.updateState({
          travelers: setTravelerAt(travelers, travelerSeatIndex, role),
        })
      );
      setTravelerSeatIndex(null);
    },
    [dispatch, travelers, travelerSeatIndex]
  );

  // 清空第 seatIndex 个旅行者座位
  const handleClearTravelerSeat = useCallback(() => {
    if (travelerSeatIndex === null) return;
    dispatch(
      gameActions.updateState({
        travelers: setTravelerAt(travelers, travelerSeatIndex, null),
      })
    );
    setTravelerSeatIndex(null);
  }, [dispatch, travelers, travelerSeatIndex]);

  const getPhaseLabel = () => {
    switch (gamePhase) {
      case "setup":
        return "准备阶段";
      case "check":
        return "核对身份";
      case "firstNight":
        return "首夜";
      case "night":
        return `第 ${nightCount} 夜`;
      case "day":
        return `第 ${nightCount} 天`;
      case "dusk":
        return "黄昏";
      case "dawnReport":
        return "天亮结算";
      case "gameOver":
        if (winResult?.toLowerCase() === "good") return "善良阵营胜利";
        if (winResult?.toLowerCase() === "evil") return "邪恶阵营胜利";
        return "游戏结束";
      case "scriptSelection":
        return "选择剧本";
      default:
        return gamePhase;
    }
  };

  const getPhaseColor = () => {
    switch (gamePhase) {
      case "setup":
        return "text-slate-400";
      case "check":
        return "text-blue-400";
      case "firstNight":
      case "night":
        return "text-purple-400";
      case "day":
        return "text-cyan-400";
      case "dusk":
        return "text-orange-400";
      case "dawnReport":
        return "text-yellow-400";
      case "gameOver":
        if (winResult?.toLowerCase() === "good") {
          return "text-amber-300 drop-shadow-[0_0_15px_rgba(251,191,36,0.8)]";
        }
        if (winResult?.toLowerCase() === "evil") {
          return "text-rose-300 drop-shadow-[0_0_15px_rgba(244,63,94,0.8)]";
        }
        return "text-red-400 drop-shadow-[0_0_12px_rgba(239,68,68,0.5)]";
      case "scriptSelection":
        return "text-slate-300";
      default:
        return "text-gray-400";
    }
  };

  // Don't show during script selection
  if (gamePhase === "scriptSelection") {
    return null;
  }

  const isGameOver = gamePhase === "gameOver";

  return (
    <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none">
      <div
        className={`compass-ring px-8 py-6 rounded-3xl shadow-2xl flex flex-col items-center gap-3 pointer-events-auto transition-all duration-500 ${
          isGameOver
            ? "bg-red-950/95 border-2 border-red-500/80 shadow-[0_0_50px_rgba(220,38,38,0.5)]"
            : "bg-slate-900/95 border border-white/10 theme-modern:border-amber-500/20 theme-modern:shadow-[0_0_40px_rgba(245,158,11,0.12)]"
        }`}
      >
        {/* Phase Indicator / Victory Title */}
        <div className={`text-4xl font-black tracking-wide ${getPhaseColor()}`}>
          {getPhaseLabel()}
        </div>

        {/* Timer - Interactive */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleTimerClick}
            className="timer-glow text-3xl font-mono font-bold text-cyan-300 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)] hover:text-cyan-200 transition-colors cursor-pointer"
            title={isTimerRunning ? "点击暂停" : "点击继续"}
          >
            {formatTimer(timer)}
          </button>
          <div className="flex gap-2 items-center">
            <button
              onClick={handleTimerClick}
              className="px-3 py-1 text-xs font-semibold text-slate-200 hover:text-white bg-slate-700/60 hover:bg-slate-600/60 rounded-lg transition-colors border border-white/5"
              title={isTimerRunning ? "暂停计时" : "继续计时"}
            >
              {isTimerRunning ? "⏸ 暂停" : "▶ 继续"}
            </button>
            <button
              onClick={handleTimerReset}
              className="px-3 py-1 text-xs font-semibold text-slate-400 hover:text-slate-300 bg-slate-800/50 rounded-lg transition-colors border border-white/5"
              title="重置计时器"
            >
              ↺ 重置
            </button>
            <div
              className={`px-2 py-1 text-xs font-semibold rounded-md ${
                isTimerRunning
                  ? "text-emerald-400 bg-emerald-900/30"
                  : "text-amber-400 bg-amber-900/30"
              }`}
            >
              {isTimerRunning ? "● 运行中" : "❚❚ 已暂停"}
            </div>
          </div>
        </div>

        {/* 说书人（传奇角色）座位 —— 不占玩家座位，全局规则生效 */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleFabledSeatClick}
            disabled={!fabledEditable}
            title={
              fabledEditable
                ? "选择传奇角色（落座确认后锁定）"
                : "落座确认后已锁定，新开一局可修改"
            }
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl border-2 transition-colors ${
              selectedFabled
                ? "border-amber-400/80 bg-amber-500/20 text-amber-200"
                : "border-white/15 bg-slate-800/60 text-slate-300"
            } ${
              fabledEditable
                ? "cursor-pointer hover:bg-slate-700/60"
                : "cursor-not-allowed opacity-70"
            }`}
          >
            <span className="text-xl">🪑</span>
            <span className="flex flex-col items-start leading-tight">
              <span className="text-xs text-slate-400">
                说书人 · 传奇角色（{selectedFabled ? 1 : 0}/{FABLED_MAX}）
              </span>
              <span className="text-2xl font-bold">
                {selectedFabled ? selectedFabled.name : "未选择"}
              </span>
            </span>
            {!fabledEditable && <span className="text-xs">🔒</span>}
          </button>

          {/* 旅行者开关 */}
          <button
            onClick={() => setShowTravelerRow((v) => !v)}
            className={`px-4 py-2 rounded-2xl border-2 transition-colors cursor-pointer ${
              showTravelerRow
                ? "border-sky-400/80 bg-sky-500/20 text-sky-200"
                : "border-white/15 bg-slate-800/60 text-slate-300 hover:bg-slate-700/60"
            }`}
            title="显示/隐藏旅行者座位行（与传奇角色不同：旅行者游戏中可随时加入/离开，落座确认后不锁定）"
          >
            <span className="text-2xl font-bold">
              🧳 旅行者（{travelerCount}/{TRAVELER_MAX}）
            </span>
          </button>
        </div>

        {/* 旅行者座位行 —— 默认隐藏，位置化 4 座，不占玩家 15 座 */}
        {showTravelerRow && (
          <div className="flex items-center gap-2">
            {travelers.map((traveler, i) => (
              <div key={`traveler-seat-${i}`} className="relative">
                <button
                  onClick={() => {
                    // 互斥：流放投票进行中禁止打开选人弹窗（防双 modal 叠加）
                    if (exileProposedToday) return;
                    setTravelerSeatIndex(i);
                  }}
                  disabled={!!exileProposedToday}
                  className={`flex flex-col items-center justify-center min-w-[110px] px-2 py-1.5 rounded-xl border-2 transition-colors ${
                    traveler
                      ? "border-sky-400/80 bg-sky-500/20 text-sky-200"
                      : "border-dashed border-white/20 bg-slate-800/40 text-slate-400 hover:bg-slate-700/50"
                  } ${
                    exileProposedToday
                      ? "cursor-not-allowed opacity-60"
                      : "cursor-pointer"
                  }`}
                  title={
                    exileProposedToday
                      ? "流放投票进行中，请先结算或取消"
                      : traveler
                        ? `旅行者：${traveler.name}（点击更换/清空）`
                        : "空旅行者座位（点击指定旅行者）"
                  }
                >
                  <span className="text-[10px] text-slate-400">座位 {i + 1}</span>
                  <span className="text-2xl font-bold leading-tight">
                    {traveler ? traveler.name : "＋"}
                  </span>
                </button>
                {/* ⛦ 放逐入口（Round 10b）：仅已占用座位；落座确认后且
                    未终局才允许（2026-10-12 交互审查：补 winResult 守卫） */}
                {traveler && exileAllowed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch(
                        gameActions.proposeExile("traveler", i, 0)
                      );
                    }}
                    title={`流放 ${traveler.name}（官方：任何人可提议，门槛=全体玩家含旅行者一半向上取整）`}
                    className="absolute -top-2 -right-2 w-7 h-7 rounded-full border-2 border-rose-400/80 bg-rose-500/25 text-rose-100 text-sm font-bold hover:bg-rose-500/40 transition-colors cursor-pointer z-10"
                  >
                    ⛦
                  </button>
                )}
              </div>
            ))}
            {/* 流放进行中状态（门槛含旅行者口径） */}
            {exileProposedToday && (
              <span className="ml-2 px-3 py-1 rounded-full border-2 border-rose-400/60 bg-rose-500/15 text-rose-200 text-sm font-bold">
                流放投票进行中：{exileProposedToday.votes.length}/
                {exileThreshold(totalPlayers)} 票
              </span>
            )}
          </div>
        )}

        {/* Credits */}
        <div className="mt-1 text-[11px] text-slate-400 font-medium tracking-wide">
          拜甘教设计
        </div>
      </div>

      {/* 传奇角色选择弹窗（上限 1：选第 2 个 = 替换） */}
      {showFabledPicker && (
        <ModalWrapper
          title="选择传奇角色（上限 1 个）"
          onClose={() => setShowFabledPicker(false)}
          maxWidthPx={960}
          autoHeight
        >
          <div className="flex flex-col gap-2">
            {FABLED_ROLES.map((f) => (
              <button
                key={f.id}
                onClick={() => handlePickFabled(f)}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors cursor-pointer ${
                  selectedFabled?.id === f.id
                    ? "border-amber-400/90 bg-amber-500/20"
                    : "border-white/10 bg-slate-800/60 hover:bg-slate-700/60"
                }`}
              >
                <div className="text-4xl font-bold text-amber-200">{f.name}</div>
                <div className="text-xl text-slate-300 mt-1">{f.ability}</div>
              </button>
            ))}
            <button
              onClick={handleClearFabled}
              className="w-full px-4 py-3 rounded-xl border-2 border-white/10 bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 text-2xl font-bold transition-colors cursor-pointer"
            >
              移除传奇角色
            </button>
          </div>
        </ModalWrapper>
      )}

      {/* 旅行者选择弹窗（位置化：只为第 travelerSeatIndex 座选择） */}
      {travelerSeatIndex !== null && !gameEnded && (
        <ModalWrapper
          title={`为座位 ${travelerSeatIndex + 1} 选择旅行者`}
          onClose={() => setTravelerSeatIndex(null)}
          maxWidthPx={960}
          autoHeight
        >
          <div className="flex flex-col gap-2">
            {TRAVELER_ROLES.map((t) => {
              // 已被其他座位占用的角色禁用（同一旅行者不得占两个座位）
              const occupiedByOther = travelers.some(
                (x, i) => x && x.id === t.id && i !== travelerSeatIndex
              );
              const chosenHere =
                travelers[travelerSeatIndex]?.id === t.id;
              return (
                <button
                  key={t.id}
                  disabled={occupiedByOther}
                  onClick={() => handlePickTraveler(t)}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                    chosenHere
                      ? "border-sky-400/90 bg-sky-500/20"
                      : "border-white/10 bg-slate-800/60"
                  } ${
                    occupiedByOther
                      ? "opacity-40 cursor-not-allowed"
                      : "cursor-pointer hover:bg-slate-700/60"
                  }`}
                  title={occupiedByOther ? "已被其他座位占用" : undefined}
                >
                  <div className="text-4xl font-bold text-sky-200">
                    {t.name}
                    {chosenHere && (
                      <span className="text-xl ml-2">✓ 当前座位</span>
                    )}
                    {occupiedByOther && (
                      <span className="text-xl ml-2">已被其他座位占用</span>
                    )}
                  </div>
                  <div className="text-xl text-slate-300 mt-1">{t.ability}</div>
                </button>
              );
            })}
            <button
              onClick={handleClearTravelerSeat}
              className="w-full px-4 py-3 rounded-xl border-2 border-white/10 bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 text-2xl font-bold transition-colors cursor-pointer"
            >
              清空该座位
            </button>
          </div>
        </ModalWrapper>
      )}

      {/* 流放投票弹窗（Round 10b） */}
      {exileProposedToday && !gameEnded && (
        <ExileVoteModal
          isOpen
          targetLabel={
            exileProposedToday.targetKind === "traveler"
              ? `旅行者 ${travelers[exileProposedToday.targetId]?.name ?? "?"}`
              : `${exileProposedToday.targetId + 1}号玩家`
          }
          targetKind={exileProposedToday.targetKind}
          proposerLabel="说书人"
          targetRoleId={
            exileProposedToday.targetKind === "traveler"
              ? (travelers[exileProposedToday.targetId]?.id ?? null)
              : (seats.find((s) => s.id === exileProposedToday.targetId)?.role
                  ?.id ?? null)
          }
          seats={seats}
          votes={exileProposedToday.votes}
          threshold={exileThreshold(totalPlayers)}
          onVote={(voterId) =>
            dispatch(gameActions.castExileVote(voterId))
          }
          onResolve={(deviantAmusing) =>
            dispatch(gameActions.resolveExile(deviantAmusing))
          }
          onClose={() => dispatch(gameActions.cancelExile())}
        />
      )}
    </div>
  );
}
