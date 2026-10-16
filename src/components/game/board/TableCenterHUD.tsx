"use client";

import type React from "react";
import { useCallback, useState } from "react";
import type { GamePhase, Role } from "../../../../app/data";
import { FABLED_ROLES, TRAVELER_ROLES } from "../../../../app/data";
import { gameActions, useGameContext } from "../../../contexts/GameContext";
import {
  canEditFabled,
  FABLED_MAX,
  FABLED_SEAT_ID,
  setTravelerAt,
  TRAVELER_MAX,
  withFabled,
} from "../../../utils/fabledLock";

/**
 * 传奇角色的展示标签（虚拟座位号 77）。
 * ⚠️ 刻意放在**组件层**而非 `fabledLock.ts`：后者有硬性不变量
 *   「不得出现含中文的字符串字面量」（fabled_lock.test.ts 不变量 5）。
 */
const FABLED_SEAT_LABEL = `${FABLED_SEAT_ID}号位(传奇)`;
import { exileThreshold } from "../../../utils/exile";
import { listAliveTravelerSlots } from "../../../utils/travelerHooks";
import { ModalWrapper } from "../../modals/ModalWrapper";
import { FabledPanel } from "../FabledPanel";
import { ExileVoteModal } from "../../modals/ExileVoteModal";
import { ConfirmChoiceModal } from "../../modals/ConfirmChoiceModal";
import { RolePickerModal } from "./RolePickerModal";

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
  /** 刚落座、待指定阵营的旅行者槽位（null = 无需指定） */
  const [alignPickSlot, setAlignPickSlot] = useState<number | null>(null);
  const [travelerSeatIndex, setTravelerSeatIndex] = useState<number | null>(
    null
  );

  // 🪑 女舍监：每个白天至多三对座位交换（旅行者不占 seats，走独立 state）
  const matronSwaps = state.travelerHookChoices?.matronSwaps ?? [];
  const matronInPlay = listAliveTravelerSlots(travelers).some(
    (t) => t.role.id === "matron"
  );
  const [showMatronSwap, setShowMatronSwap] = useState(false);
  /** 🎴 传奇角色操作面板（说书人裁定入口） */
  const [showFabledPanel, setShowFabledPanel] = useState(false);
  const [matronPick, setMatronPick] = useState<number | null>(null);
  const handleMatronPick = useCallback(
    (seatId: number) => {
      if (matronPick === null) {
        setMatronPick(seatId);
        return;
      }
      if (matronPick === seatId) {
        setMatronPick(null);
        return;
      }
      dispatch(gameActions.matronSwap(matronPick, seatId));
      setMatronPick(null);
    },
    [matronPick, dispatch]
  );

  const handleFabledSeatClick = useCallback(() => {
    if (!canEditFabled(gamePhase)) return;
    setShowFabledPicker(true);
  }, [gamePhase]);

  const handlePickFabled = useCallback(
    (role: Role) => {
      dispatch(gameActions.setActiveFabled(withFabled(activeFabled, role)));
      // ⭐ 传奇角色的虚拟座位号（77）在此**首次被真实消费**：写进操作记录，
      //   让复盘能一眼分辨「这条规则来自传奇位 77，不是某个玩家」。
      dispatch(
        gameActions.addLog({
          day: state.nightCount ?? 0,
          phase: state.gamePhase,
          message: `🪑 说书人选定传奇角色【${role.name}】—— 虚拟座位 ${FABLED_SEAT_LABEL}，不占任何玩家座位`,
        } as any)
      );
      setShowFabledPicker(false);
    },
    [dispatch, activeFabled, state.nightCount, state.gamePhase]
  );

  const handleClearFabled = useCallback(() => {
    dispatch(gameActions.setActiveFabled([]));
    dispatch(
      gameActions.addLog({
        day: state.nightCount ?? 0,
        phase: state.gamePhase,
        message: `🪑 移除传奇角色（虚拟座位 ${FABLED_SEAT_LABEL} 已空置）`,
      } as any)
    );
    setShowFabledPicker(false);
  }, [dispatch, state.nightCount, state.gamePhase]);

  // 为第 seatIndex 个旅行者座位指定/更换角色（位置化写入）
  // ⭐ 落座后立即弹窗指定阵营（官方：旅行者可善良可邪恶，由说书人决定）——
  //   背景 P0：`traveler` 被 seatAlignment 硬编码为善良 ⇒ 邪恶旅行者无法表达，
  //   替罪羊代刑等依赖阵营的规则会静默失效。故落座即选，不省略。
  const handlePickTraveler = useCallback(
    (role: Role) => {
      if (travelerSeatIndex === null) return;
      const slot = travelerSeatIndex;
      dispatch(
        gameActions.updateState({
          travelers: setTravelerAt(travelers, slot, role),
        })
      );
      setTravelerSeatIndex(null);
      setAlignPickSlot(slot);
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
        className={`compass-ring px-8 py-6 rounded-3xl shadow-2xl flex flex-col items-center gap-3 pointer-events-auto transition-all duration-500 theme-modern:rounded-sm theme-modern:shadow-none theme-modern:border theme-modern:border-[color:var(--rule)] theme-modern:bg-[color:var(--color-surface)] theme-modern:border-t-[6px] theme-modern:border-t-[color:var(--color-primary)] ${
          isGameOver
            ? "bg-red-950/95 border-2 border-red-500/80 shadow-[0_0_50px_rgba(220,38,38,0.5)]"
            : "bg-slate-900/95 border border-white/10"
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
            className="timer-glow text-3xl font-mono font-bold text-cyan-300 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)] hover:text-cyan-200 transition-colors cursor-pointer theme-modern:text-[color:var(--ink-900)] theme-modern:drop-shadow-none hover:theme-modern:text-[color:var(--red)]"
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
            className={`flex items-center gap-2 px-4 py-2 min-h-[68px] rounded-2xl border-2 transition-colors ${
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
                <span className="ml-1 text-amber-300">{FABLED_SEAT_LABEL}</span>
              </span>
              <span className="text-2xl font-bold">
                {selectedFabled ? selectedFabled.name : "未选择"}
              </span>
            </span>
            {!fabledEditable && <span className="text-xs">🔒</span>}
          </button>

          {/* 🎴 传奇角色操作入口（仅已选传奇角色时显示） */}
          {selectedFabled && (
            <button
              onClick={() => setShowFabledPanel(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 min-h-[68px] rounded-2xl border-2 border-violet-400/60 bg-violet-500/10 text-violet-100 transition-colors cursor-pointer hover:bg-violet-500/20"
              title="传奇角色的说书人操作（摆渡人 / 玩具匠 / 骗人精 / 天使 / 革命者 / 哨兵 / 圣洁之魂 / 佛教徒）"
            >
              <span className="text-xl">🎴</span>
              <span className="flex flex-col items-start leading-tight">
                <span className="text-xs text-violet-200/80">传奇角色 · 操作</span>
                <span className="text-xl font-bold">{selectedFabled.name}</span>
              </span>
            </button>
          )}

          {/* 🪑 女舍监换座入口（仅女舍监在场时显示；官方「每个白天至多三对」） */}
          {matronInPlay && (
            <button
              onClick={() => setShowMatronSwap(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 min-h-[68px] rounded-2xl border-2 border-amber-400/60 bg-amber-500/10 text-amber-100 transition-colors cursor-pointer hover:bg-amber-500/20"
              title="女舍监：每个白天至多交换三对玩家的座位"
            >
              <span className="text-xl">🪑</span>
              <span className="flex flex-col items-start leading-tight">
                <span className="text-xs text-amber-200/80">女舍监 · 换座</span>
                <span className="text-xl font-bold">
                  已用 {matronSwaps.length} / 3 对
                </span>
              </span>
            </button>
          )}

          {/* 旅行者开关 */}
          <button
            onClick={() => setShowTravelerRow((v) => !v)}
            className={`flex items-center justify-center px-4 py-2 min-h-[68px] rounded-2xl border-2 transition-colors cursor-pointer ${
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

      {/* 传奇角色选择弹窗（上限 1：选第 2 个 = 替换）
          ⭐ 2026-10-13 视觉重做：内联竖直列表 → 抽出 RolePickerModal
          （代币徽章 + 卡片网格 + 能力全文，对齐「角色图鉴」「自定义剧本」设计语言） */}
      <RolePickerModal
        open={showFabledPicker}
        kind="fabled"
        title="选择传奇角色（上限 1 个）"
        roles={FABLED_ROLES}
        selectedId={selectedFabled?.id ?? null}
        countLabel={`已选 ${selectedFabled ? 1 : 0} / ${FABLED_MAX}`}
        hint="传奇角色不占玩家座位、规则全局生效；同一时间只会有 1 个生效（再选一个 = 替换）。落座确认后锁定，新开一局可修改。"
        onPick={handlePickFabled}
        onClear={handleClearFabled}
        clearLabel="移除传奇角色"
        onClose={() => setShowFabledPicker(false)}
      />

      {/* 🎴 传奇角色操作面板 */}
      <FabledPanel
        isOpen={showFabledPanel}
        onClose={() => setShowFabledPanel(false)}
      />

      {/* 🪑 女舍监：交换座位（官方「每个白天，你可以选择至多三对玩家交换座位」） */}
      {matronInPlay && showMatronSwap && (
        <ModalWrapper
          title={`🪑 女舍监 · 交换座位（已用 ${matronSwaps.length} / 3 对）`}
          onClose={() => {
            setShowMatronSwap(false);
            setMatronPick(null);
          }}
          widthRatio={0.86}
          autoHeight
        >
          <div className="flex flex-col gap-4 p-5 text-white">
            <div className="text-lg text-slate-300 leading-relaxed">
              点选**两名**玩家即完成一次换座（两个人互换物理座位，角色与状态随人走）。
              {matronPick !== null && (
                <span className="ml-2 text-emerald-300 font-bold">
                  已选第一名：{matronPick + 1} 号，请点第二名
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {seats.map((s) => {
                const picked = matronPick === s.id;
                const swapped = matronSwaps.some(
                  (w) => w.a === s.id || w.b === s.id
                );
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleMatronPick(s.id)}
                    className={`px-4 py-2.5 rounded-xl border-2 text-base font-bold transition-colors cursor-pointer active:scale-95 ${
                      picked
                        ? "border-emerald-300 bg-emerald-600 text-white"
                        : swapped
                          ? "border-amber-400/70 bg-amber-900/30 text-amber-100"
                          : "border-white/15 bg-slate-800/70 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    {s.id + 1} 号
                    {swapped ? " ⇄" : ""}
                  </button>
                );
              })}
            </div>
            {matronSwaps.length > 0 && (
              <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-base text-amber-100">
                本日已换：
                {matronSwaps.map((w) => `${w.a + 1}↔${w.b + 1}`).join("、")}
              </div>
            )}
            <div className="text-sm text-slate-400 leading-relaxed">
              ⚠️ 换座按官方改变**物理邻座关系**；但本仓库的投票/提名记录以座位 id 为键，
              换座前已产生的记录不会随之改写 —— 若同一提名仍在进行，请由说书人重新核对。
            </div>
          </div>
        </ModalWrapper>
      )}

      {/* 旅行者选择弹窗（位置化：只为第 travelerSeatIndex 座选择） */}
      <RolePickerModal
        open={travelerSeatIndex !== null && !gameEnded}
        kind="traveler"
        title={`为座位 ${(travelerSeatIndex ?? 0) + 1} 选择旅行者`}
        roles={TRAVELER_ROLES}
        selectedId={
          travelerSeatIndex !== null
            ? (travelers[travelerSeatIndex]?.id ?? null)
            : null
        }
        disabledIds={travelers
          .map((t, i) => (t && i !== travelerSeatIndex ? t.id : null))
          .filter((x): x is string => !!x)}
        countLabel={`已占 ${travelerCount} / ${TRAVELER_MAX}`}
        hint="旅行者不占玩家座位；游戏中可随时加入或离开，且同一个旅行者不能同时占两个座位（已被占用的会置灰）。"
        onPick={handlePickTraveler}
        onClear={handleClearTravelerSeat}
        clearLabel="清空该座位"
        onClose={() => setTravelerSeatIndex(null)}
      />

      {/* ⭐ 旅行者阵营指定（落座即选）—— 官方：旅行者可善良可邪恶，由说书人决定 */}
      <ConfirmChoiceModal
        isOpen={alignPickSlot !== null}
        title="⚔️ 旅行者阵营"
        message={`请为刚落座的旅行者（${(alignPickSlot ?? 0) + 1}号旅行者位）指定阵营。官方规则：旅行者可以是善良或邪恶，由说书人决定。`}
        options={[
          { label: "🛡️ 善良", value: "good" },
          { label: "⚔️ 邪恶", value: "evil" },
        ]}
        onSelect={(v) => {
          if (alignPickSlot !== null) {
            dispatch(
              gameActions.setTravelerAlignment(
                alignPickSlot,
                v === "evil" ? "evil" : "good"
              )
            );
          }
          setAlignPickSlot(null);
        }}
        onCancel={() => {
          // 不选 = 默认善良（清除显式指定，回到 isTravelerEvil 的默认口径）
          if (alignPickSlot !== null) {
            dispatch(gameActions.setTravelerAlignment(alignPickSlot, null));
          }
          setAlignPickSlot(null);
        }}
      />

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
