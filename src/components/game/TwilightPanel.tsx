"use client";

import { useGameContext } from "../../contexts/GameContext";
import { buildTwilightSteps } from "../../utils/travelerDusk";
import { unifiedEventBus } from "../../utils/unifiedEventBus";

/**
 * 暮色（Twilight = 官方 Dusk）面板
 * ==================================================================
 * 🔴 为什么必须有这个面板（2026-10-13 实测）：
 *   夜序队列（`dynamicQueueGenerator`）与夜间引擎（`useNightEngine`）
 *   **全仓零 traveler 引用**，而旅行者只存在于 `state.travelers`（不占 seats）
 *   ⇒ 15 个旅行者里 14 个的规则在真实对局里**从不触发**。
 *
 * ✅ 修法（用户选定方案 B）：在「提名/处决」与「入夜」之间插入**独立暮色阶段**，
 *   按官方黄昏顺序逐个唤醒有行动的旅行者。
 *
 * ⚠️ 命名：本仓库 `dusk` = 白天提名阶段；官方 Dusk = 入夜前的行动时刻。
 *    两者**不是一回事**，故用独立阶段名 `twilight`，勿合并。
 *
 * ⚠️ 本面板只负责「唤醒 + 提示 + 逐步确认」，**不做效果结算**。
 *    各旅行者效果落地情况见 `traveler_wiring_contract.test.ts`：
 *    已落地的会登记在 `PRODUCTION_REACHABLE` 里并附宿主证据。
 */
export function TwilightPanel() {
  const { state, dispatch } = useGameContext();

  if (state.gamePhase !== "twilight") return null;

  const isFirstNight = !state.hasCompletedFirstNight;
  const steps = buildTwilightSteps(state.travelers ?? [], isFirstNight);
  const idx = Math.min(state.twilightStepIndex ?? 0, Math.max(0, steps.length - 1));
  const current = steps[idx];
  const isLast = idx >= steps.length - 1;

  const goNext = () => {
    dispatch({ type: "SET_TWILIGHT_STEP", index: idx + 1 });
  };
  const goPrev = () => {
    dispatch({ type: "SET_TWILIGHT_STEP", index: Math.max(0, idx - 1) });
  };
  const finish = () => {
    // 暮色结束 → 入夜。首夜与否由引擎侧 hasCompletedFirstNight 推导。
    dispatch({ type: "SET_TWILIGHT_STEP", index: 0 });
    dispatch({
      type: "SET_GAME_PHASE",
      phase: isFirstNight ? "firstNight" : "night",
    });
    // ⚠️ 必须 emit（不能只切 phase）：首夜走 startFirstNight 才会生成夜间队列，
    //    否则小恶魔等恶魔不会被唤醒。与 useGameFlow::startNightCore 同口径。
    unifiedEventBus.emit(
      isFirstNight ? "startFirstNight" : "startSubsequentNight",
      {}
    );
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border-2 border-indigo-400/50 bg-slate-900/95 shadow-2xl p-6 flex flex-col gap-4">
        {/* 标题 */}
        <div className="flex items-baseline justify-between">
          <div className="text-3xl font-bold text-indigo-100">
            🌆 暮色（{isFirstNight ? "首夜" : `第 ${state.nightCount} 夜`}）
          </div>
          <div className="text-sm text-indigo-300/80">
            步骤 {steps.length === 0 ? 0 : idx + 1} / {steps.length}
          </div>
        </div>
        <div className="text-sm text-slate-400">
          官方 Dusk：入夜之前，旅行者（及传奇角色）在此行动。
          <span className="text-slate-500">
            （本仓库的「黄昏」是白天提名阶段，与本阶段不同）
          </span>
        </div>

        {steps.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-6 text-center text-slate-300">
            本夜没有需要行动的旅行者。
          </div>
        ) : (
          <div className="rounded-xl border-2 border-indigo-400/40 bg-indigo-500/10 px-4 py-4">
            <div className="text-2xl font-bold text-indigo-100 mb-1">
              唤醒：{current.roleName}
              <span className="ml-2 text-base text-indigo-300/80">
                （旅行者席位 {current.seatIndex + 1}）
              </span>
            </div>
            <div className="text-base text-slate-200 leading-relaxed">
              {current.ability || "（该角色能力原文缺失，请核对数据）"}
            </div>
            <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              <span className="font-bold">说书人操作：</span>
              {current.hint}
            </div>
          </div>
        )}

        {/* 步骤进度点 */}
        {steps.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {steps.map((s, i) => (
              <span
                key={s.key}
                className={`px-2 py-1 rounded-lg text-xs font-bold border ${
                  i === idx
                    ? "border-indigo-300 bg-indigo-500/30 text-indigo-100"
                    : i < idx
                      ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-200"
                      : "border-white/10 bg-slate-800/60 text-slate-400"
                }`}
              >
                {i < idx ? "✓ " : ""}
                {s.roleName}
              </span>
            ))}
          </div>
        )}

        {/* 操作 */}
        <div className="flex items-center gap-3">
          <button
            onClick={goPrev}
            disabled={idx === 0}
            className="px-4 py-3 rounded-xl border-2 border-white/15 bg-slate-800/60 text-slate-300 font-bold hover:bg-slate-700/60 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            上一步
          </button>
          {!isLast && (
            <button
              onClick={goNext}
              className="flex-1 px-4 py-3 rounded-xl border-2 border-indigo-400/80 bg-indigo-500/20 text-indigo-100 text-lg font-bold hover:bg-indigo-500/30 cursor-pointer"
            >
              完成，下一位 →
            </button>
          )}
          {isLast && (
            <button
              onClick={finish}
              className="flex-1 px-4 py-3 rounded-xl border-2 border-emerald-400/80 bg-emerald-500/20 text-emerald-100 text-lg font-bold hover:bg-emerald-500/30 cursor-pointer"
            >
              暮色结束，入夜 🌙
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
